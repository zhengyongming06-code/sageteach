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
  options?: { max_tokens?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<string> {
  const max_tokens = options?.max_tokens ?? 1000;
  const timeoutMs = options?.timeoutMs;

  if (timeoutMs != null && timeoutMs > 0) {
    let tid: ReturnType<typeof setTimeout> | undefined;
    const timeoutP = new Promise<never>((_, rej) => {
      tid = setTimeout(() => rej(new DeepSeekTimeoutError()), timeoutMs);
    });
    try {
      return await Promise.race([
        invokeOnce(messages, max_tokens, options?.signal),
        timeoutP,
      ]);
    } finally {
      if (tid !== undefined) clearTimeout(tid);
    }
  }

  return await invokeOnce(messages, max_tokens, options?.signal);
}
