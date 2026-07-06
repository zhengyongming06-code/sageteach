import { assertValidDeepSeekProxyPayload } from "./deepseek-proxy-validation";
import type { DeepSeekMessage } from "./deepseek-types";

export type { DeepSeekMessage, DeepSeekRole } from "./deepseek-types";

/** DeepSeek rejected the API key (401/403) or key missing in client bundle. */
export class DeepSeekAuthError extends Error {
  constructor(message = "AI服务密钥失效，请联系管理员") {
    super(message);
    this.name = "DeepSeekAuthError";
  }
}

/** VITE_DEEPSEEK_API_KEY not set at build time (local .env or CI). */
export class DeepSeekConfigError extends Error {
  constructor(message = "AI服务未配置，请联系管理员") {
    super(message);
    this.name = "DeepSeekConfigError";
  }
}

export class DeepSeekTimeoutError extends Error {
  constructor() {
    super("DeepSeek request timed out");
    this.name = "DeepSeekTimeoutError";
  }
}

export function isDeepSeekAuthError(e: unknown): boolean {
  return e instanceof DeepSeekAuthError || e instanceof DeepSeekConfigError;
}

/** Map DeepSeek client errors to user-facing toast copy. */
export function getDeepSeekUserMessage(e: unknown): string {
  if (e instanceof DeepSeekAuthError || e instanceof DeepSeekConfigError) {
    return e.message;
  }
  if (e instanceof Error && e.message.trim()) return e.message;
  return "发送失败";
}

function readDeepSeekApiKey(): string {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new DeepSeekConfigError();
  }
  return apiKey;
}

let envCheckLogged = false;

function logDeepSeekEnvOnce() {
  if (envCheckLogged) return;
  envCheckLogged = true;
  const raw = import.meta.env.VITE_DEEPSEEK_API_KEY;
  const trimmed = raw?.trim();
  if (import.meta.env.DEV) {
    console.log("[deepseek] env check", {
      VITE_DEEPSEEK_API_KEY: trimmed
        ? `loaded (${trimmed.length} chars)`
        : "MISSING or empty — set in .env and restart dev server",
    });
  } else if (!trimmed) {
    console.error(
      "[deepseek] VITE_DEEPSEEK_API_KEY missing in production bundle — set at build time (e.g. Cloudflare Pages env)",
    );
  }
}

function throwForDeepSeekHttpError(status: number, raw: string, context: string): never {
  logUpstreamResponse(context, status, raw);
  if (status === 401 || status === 403) {
    throw new DeepSeekAuthError();
  }
  throw new Error(`AI 服务暂时不可用（${status}）`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logUpstreamResponse(context: string, status: number, raw: string) {
  console.error(`[${context}] upstream non-JSON or error body`, {
    status,
    length: raw.length,
    snippet: raw.slice(0, 800),
  });
}

export function isRetryableNetworkFailure(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return false;
  if (e instanceof DeepSeekTimeoutError) return false;
  if (e instanceof TypeError) return true;
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  );
}

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

/** Read OpenAI-compatible SSE stream from DeepSeek and call onDelta for each token chunk. */
async function readDeepSeekSseStream(
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
    throw new Error("AI 没有返回内容，再试一次。");
  }
  return text;
}

export type DeepSeekModel = "deepseek-chat" | "deepseek-reasoner";

/** Direct DeepSeek API (non-streaming) — summaries / daily questions. */
async function invokeDeepSeekDirect(
  messages: DeepSeekMessage[],
  max_tokens: number,
  model: DeepSeekModel,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = readDeepSeekApiKey();

  const { messages: safeMessages, max_tokens: safeMax } = assertValidDeepSeekProxyPayload({
    messages,
    max_tokens,
  });

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: safeMessages,
      max_tokens: safeMax,
      stream: false,
    }),
  });

  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    logUpstreamResponse("deepseek-direct", res.status, raw);
    throw new Error("AI 服务返回格式异常，请稍后重试。");
  }

  if (!res.ok) {
    throwForDeepSeekHttpError(res.status, raw, "deepseek-direct");
  }

  const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })?.choices;
  const text = choices?.[0]?.message?.content?.trim();
  if (text) return text;

  if (!choices || choices.length === 0) {
    if (model === "deepseek-reasoner") {
      console.log("[deepseek-direct] R1 empty, falling back to deepseek-chat");
      return invokeDeepSeekDirect(messages, max_tokens, "deepseek-chat", signal);
    }
  } else if (model === "deepseek-reasoner") {
    console.log("[deepseek-direct] R1 empty content, falling back to deepseek-chat");
    return invokeDeepSeekDirect(messages, max_tokens, "deepseek-chat", signal);
  }

  console.error("[deepseek-direct] empty choices", { status: res.status, model });
  throw new Error("AI 没有返回内容，再试一次。");
}

/** Streaming DeepSeek chat — SSE token deltas via onDelta. */
async function invokeDeepSeekDirectStream(
  messages: DeepSeekMessage[],
  max_tokens: number,
  model: DeepSeekModel,
  onDelta: (textSoFar: string, delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = readDeepSeekApiKey();

  const { messages: safeMessages, max_tokens: safeMax } = assertValidDeepSeekProxyPayload({
    messages,
    max_tokens,
  });

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      messages: safeMessages,
      max_tokens: safeMax,
      stream: true,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throwForDeepSeekHttpError(res.status, raw, "deepseek-stream");
  }

  if (!res.body) {
    throw new Error("AI 流式响应不可用（无 body）");
  }

  return readDeepSeekSseStream(res.body, onDelta, signal);
}

async function invokeOnce(
  messages: DeepSeekMessage[],
  max_tokens: number,
  model: DeepSeekModel,
  signal: AbortSignal | undefined,
  onDelta: ((textSoFar: string, delta: string) => void) | undefined,
): Promise<string> {
  if (onDelta) {
    return invokeDeepSeekDirectStream(messages, max_tokens, model, onDelta, signal);
  }
  return invokeDeepSeekDirect(messages, max_tokens, model, signal);
}

function mergeAbortSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    },
  };
}

export type InvokeDeepSeekChatOptions = {
  max_tokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onRetrying?: () => void;
  model?: DeepSeekModel;
  /** Enables `stream: true` and incremental UI updates. */
  onDelta?: (textSoFar: string, delta: string) => void;
};

/**
 * DeepSeek chat completions (browser → api.deepseek.com).
 * Pass `onDelta` for ChatGPT-style streaming; omit for one-shot responses.
 */
export async function invokeDeepSeekChat(
  messages: DeepSeekMessage[],
  options?: InvokeDeepSeekChatOptions,
): Promise<string> {
  const max_tokens = options?.max_tokens ?? 1000;
  const timeoutMs = options?.timeoutMs;
  const model = options?.model ?? "deepseek-chat";
  const maxAttempts = 3;
  const onDelta = options?.onDelta;

  logDeepSeekEnvOnce();

  if (import.meta.env.DEV) {
    console.log("[deepseek] outgoing messages", {
      streaming: !!onDelta,
      messageCount: messages.length,
      max_tokens,
    });
  } else {
    console.log("[deepseek] request", {
      streaming: !!onDelta,
      messageCount: messages.length,
      max_tokens,
    });
  }

  let lastErr: unknown;
  let receivedAnyToken = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal, timedOut, cleanup } = mergeAbortSignals(options?.signal, timeoutMs);
    try {
      const deltaCb = onDelta
        ? (full: string, delta: string) => {
            receivedAnyToken = true;
            onDelta(full, delta);
          }
        : undefined;

      const text = await invokeOnce(messages, max_tokens, model, signal, deltaCb);
      return text;
    } catch (e) {
      if (timedOut()) {
        lastErr = new DeepSeekTimeoutError();
      } else {
        lastErr = e;
      }
      const canRetry =
        attempt < maxAttempts &&
        !isDeepSeekAuthError(lastErr) &&
        isRetryableNetworkFailure(lastErr) &&
        (!onDelta || !receivedAnyToken);
      if (!canRetry) throw lastErr;
      receivedAnyToken = false;
      options?.onRetrying?.();
      await sleep(1000);
    } finally {
      cleanup();
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
