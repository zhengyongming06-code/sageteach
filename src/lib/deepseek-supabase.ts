import { assertValidDeepSeekProxyPayload } from "./deepseek-proxy-validation";
import type { DeepSeekMessage } from "./deepseek-types";

export type { DeepSeekMessage, DeepSeekRole } from "./deepseek-types";

export class DeepSeekTimeoutError extends Error {
  constructor() {
    super("DeepSeek request timed out");
    this.name = "DeepSeekTimeoutError";
  }
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

/** Direct DeepSeek API from the browser (temporary; move behind Edge Function later). */
async function invokeDeepSeekDirect(
  messages: DeepSeekMessage[],
  max_tokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing VITE_DEEPSEEK_API_KEY");
  }

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
      model: "deepseek-chat",
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
    logUpstreamResponse("deepseek-direct", res.status, raw);
    throw new Error(`AI 服务暂时不可用（${res.status}）`);
  }

  const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })?.choices;
  const text = choices?.[0]?.message?.content?.trim();
  if (text) return text;

  console.error("[deepseek-direct] empty choices", { status: res.status });
  throw new Error("AI 没有返回内容，再试一次。");
}

async function invokeOnce(
  messages: DeepSeekMessage[],
  max_tokens: number,
  signal?: AbortSignal,
): Promise<string> {
  return invokeDeepSeekDirect(messages, max_tokens, signal);
}

/**
 * DeepSeek chat completions (browser → api.deepseek.com).
 * TODO: proxy via Supabase Edge Function for production key safety.
 */
export async function invokeDeepSeekChat(
  messages: DeepSeekMessage[],
  options?: {
    max_tokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onRetrying?: () => void;
  },
): Promise<string> {
  const max_tokens = options?.max_tokens ?? 1000;
  const timeoutMs = options?.timeoutMs;
  const maxAttempts = 3;

  const runSingleAttempt = async (): Promise<string> => {
    if (timeoutMs != null && timeoutMs > 0) {
      let tid: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<never>((_, rej) => {
        tid = setTimeout(() => rej(new DeepSeekTimeoutError()), timeoutMs);
      });
      try {
        return await Promise.race([invokeOnce(messages, max_tokens, options?.signal), timeoutP]);
      } finally {
        if (tid !== undefined) clearTimeout(tid);
      }
    }
    return await invokeOnce(messages, max_tokens, options?.signal);
  };

  if (import.meta.env.DEV) {
    console.log("[deepseek] outgoing messages (full payload to API)", messages);
  } else {
    console.log("[deepseek] request", { messageCount: messages.length, max_tokens });
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runSingleAttempt();
    } catch (e) {
      lastErr = e;
      const canRetry = attempt < maxAttempts && isRetryableNetworkFailure(e);
      if (!canRetry) throw e;
      options?.onRetrying?.();
      await sleep(1000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
