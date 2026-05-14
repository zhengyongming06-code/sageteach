import { getBearerAuthHeaders } from "./server-fn-auth";
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

/**
 * Calls Supabase Edge Function `deepseek-chat` from the browser (session Bearer + anon apikey).
 */
async function invokeEdgeDeepSeek(
  messages: DeepSeekMessage[],
  max_tokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anon =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!base || !anon) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const authHeaders = await getBearerAuthHeaders();
  const { messages: safeMessages, max_tokens: safeMax } = assertValidDeepSeekProxyPayload({
    messages,
    max_tokens,
  });

  const res = await fetch(`${base}/functions/v1/deepseek-chat`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeaders.Authorization,
      apikey: anon,
    },
    body: JSON.stringify({ messages: safeMessages, max_tokens: safeMax }),
  });

  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    logUpstreamResponse("deepseek-edge-fn", res.status, raw);
    throw new Error("AI 服务返回格式异常，请稍后重试。");
  }

  if (!res.ok) {
    logUpstreamResponse("deepseek-edge-fn", res.status, raw);
    throw new Error(`AI 服务暂时不可用（${res.status}）`);
  }

  const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })?.choices;
  const text = choices?.[0]?.message?.content?.trim();
  if (text) return text;

  console.error("[deepseek-edge-fn] empty choices", { status: res.status });
  throw new Error("AI 没有返回内容，再试一次。");
}

async function invokeOnce(
  messages: DeepSeekMessage[],
  max_tokens: number,
  signal?: AbortSignal,
): Promise<string> {
  return invokeEdgeDeepSeek(messages, max_tokens, signal);
}

/**
 * DeepSeek via Supabase Edge Function `deepseek-chat` (browser; requires logged-in session).
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
