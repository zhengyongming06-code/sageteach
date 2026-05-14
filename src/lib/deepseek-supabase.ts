import { proxyDeepSeekEdge } from "./deepseek-edge-proxy.functions";
import { getBearerAuthHeaders } from "./server-fn-auth";
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

async function invokeOnce(
  messages: DeepSeekMessage[],
  max_tokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const headers = await getBearerAuthHeaders();
  const out = await proxyDeepSeekEdge({
    data: { messages, max_tokens },
    headers,
    ...(signal ? { signal } : {}),
  });
  return out.text;
}

/**
 * DeepSeek via Supabase Edge Function `deepseek-chat`, called through a same-origin
 * server function so the browser never hits cross-origin CORS on Supabase.
 */
export async function invokeDeepSeekChat(
  messages: DeepSeekMessage[],
  options?: {
    max_tokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Called before attempt 2 and 3 when retrying after a network failure. */
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
