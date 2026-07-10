const ERNIE_ENDPOINT = "https://qianfan.baidubce.com/v2/chat/completions";
const ERNIE_MODEL = "ernie-4.5-turbo-vl";

export type ErnieContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ErnieMessage = {
  role: "user" | "assistant" | "system";
  content: string | ErnieContentPart[];
};

function parseSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const json = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string | null } }>;
    };
    const piece = json.choices?.[0]?.delta?.content;
    return typeof piece === "string" && piece.length > 0 ? piece : null;
  } catch {
    return null;
  }
}

async function readErnieSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (textSoFar: string, delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const delta = parseSseDelta(line);
        if (delta) {
          accumulated += delta;
          onDelta(accumulated, delta);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        const delta = parseSseDelta(line);
        if (delta) {
          accumulated += delta;
          onDelta(accumulated, delta);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const text = accumulated.trim();
  if (!text) {
    throw new Error("AI 没有返回内容，再试一次");
  }
  return text;
}

function getErnieApiKey(): string {
  const apiKey = import.meta.env.ERNIE_API_KEY?.trim() ?? import.meta.env.VITE_ERNIE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 ERNIE API Key，请在环境变量中配置 ERNIE_API_KEY");
  }
  return apiKey;
}

export type ErnieVlChatOptions = {
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

function buildErnieRequestBody(
  messages: ErnieMessage[],
  options: ErnieVlChatOptions | undefined,
  stream: boolean,
) {
  const body: Record<string, unknown> = {
    model: ERNIE_MODEL,
    messages,
    max_tokens: options?.max_tokens ?? 4096,
    stream,
  };
  if (options?.temperature != null) {
    body.temperature = options.temperature;
  }
  return body;
}

export async function invokeErnieVlChat(
  messages: ErnieMessage[],
  options?: ErnieVlChatOptions,
): Promise<string> {
  const apiKey = getErnieApiKey();

  const res = await fetch(ERNIE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildErnieRequestBody(messages, options, false)),
    signal: options?.signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("[ernie-vl] upstream error", res.status, raw.slice(0, 500));
    throw new Error(`题目识别失败（${res.status}），请稍后重试`);
  }

  let json: { choices?: Array<{ message?: { content?: string | null } }> };
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    throw new Error("题目识别返回格式异常");
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI 没有返回内容，再试一次");
  }
  return content.trim();
}

/** Streaming ERNIE-VL chat; falls back to non-streaming if SSE is unavailable. */
export async function invokeErnieVlChatStream(
  messages: ErnieMessage[],
  onDelta: (textSoFar: string, delta: string) => void,
  options?: ErnieVlChatOptions,
): Promise<string> {
  const apiKey = getErnieApiKey();

  const res = await fetch(ERNIE_ENDPOINT, {
    method: "POST",
    signal: options?.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(buildErnieRequestBody(messages, options, true)),
  });

  if (!res.ok) {
    const raw = await res.text();
    console.warn("[ernie-vl] stream failed, retrying without stream", res.status, raw.slice(0, 300));
    const text = await invokeErnieVlChat(messages, options);
    onDelta(text, text);
    return text;
  }

  if (!res.body) {
    const text = await invokeErnieVlChat(messages, options);
    onDelta(text, text);
    return text;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") && !contentType.includes("stream")) {
    const raw = await res.text();
    let json: { choices?: Array<{ message?: { content?: string | null } }> };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      throw new Error("题目识别返回格式异常");
    }
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("AI 没有返回内容，再试一次");
    onDelta(content, content);
    return content;
  }

  try {
    return await readErnieSseStream(res.body, onDelta, options?.signal);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    console.warn("[ernie-vl] SSE read failed, retrying without stream", e);
    const text = await invokeErnieVlChat(messages, options);
    onDelta(text, text);
    return text;
  }
}
