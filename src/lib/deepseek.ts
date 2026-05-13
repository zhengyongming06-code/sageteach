export type DeepSeekRole = "system" | "user" | "assistant";
export type DeepSeekMessage = { role: DeepSeekRole; content: string };

export async function fetchDeepSeekReply(messages: DeepSeekMessage[]): Promise<string> {
  const key = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;
  if (!key?.trim()) throw new Error("请配置 VITE_DEEPSEEK_API_KEY");

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("DeepSeek error", res.status, txt);
    if (res.status === 429) throw new Error("请求太频繁，稍后再试。");
    throw new Error("AI 暂时连不上，过会再试。");
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI 没有返回内容，再试一次。");
  return content;
}

/**
 * Streams chat completion deltas from DeepSeek (OpenAI-compatible SSE).
 * Calls onDelta with accumulated text after each token chunk.
 */
export async function fetchDeepSeekReplyStreaming(
  messages: DeepSeekMessage[],
  onDelta: (fullText: string) => void,
  options?: { max_tokens?: number; signal?: AbortSignal },
): Promise<string> {
  const key = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;
  if (!key?.trim()) throw new Error("请配置 VITE_DEEPSEEK_API_KEY");

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    signal: options?.signal,
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: true,
      max_tokens: options?.max_tokens ?? 1000,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("DeepSeek stream error", res.status, txt);
    if (res.status === 429) throw new Error("请求太频繁，稍后再试。");
    throw new Error("AI 暂时连不上，过会再试。");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取 AI 响应流。");

  const decoder = new TextDecoder();
  let carry = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const raw of parts) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null } }>;
        };
        const token = data.choices?.[0]?.delta?.content ?? "";
        if (token) {
          fullText += token;
          onDelta(fullText);
        }
      } catch {
        /* ignore malformed JSON lines */
      }
    }
  }

  const tail = carry.trim();
  if (tail.startsWith("data:")) {
    const payload = tail.slice(5).trim();
    if (payload && payload !== "[DONE]") {
      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null } }>;
        };
        const token = data.choices?.[0]?.delta?.content ?? "";
        if (token) {
          fullText += token;
          onDelta(fullText);
        }
      } catch {
        /* ignore */
      }
    }
  }

  const trimmed = fullText.trim();
  if (!trimmed) throw new Error("AI 没有返回内容，再试一次。");
  return trimmed;
}

export class DeepSeekTimeoutError extends Error {
  constructor() {
    super("DeepSeek request timed out");
    this.name = "DeepSeekTimeoutError";
  }
}

/** Same as fetchDeepSeekReply but aborts after timeoutMs (e.g. summary extraction). */
export async function fetchDeepSeekReplyWithTimeout(
  messages: DeepSeekMessage[],
  timeoutMs: number,
): Promise<string> {
  const key = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;
  if (!key?.trim()) throw new Error("请配置 VITE_DEEPSEEK_API_KEY");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("DeepSeek error", res.status, txt);
      if (res.status === 429) throw new Error("请求太频繁，稍后再试。");
      throw new Error("AI 暂时连不上，过会再试。");
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI 没有返回内容，再试一次。");
    return content;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new DeepSeekTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
