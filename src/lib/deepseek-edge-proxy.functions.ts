import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertValidDeepSeekProxyPayload } from "./deepseek-proxy-validation";

function logUpstreamResponse(context: string, status: number, raw: string) {
  console.error(`[${context}] upstream non-JSON or error body`, {
    status,
    length: raw.length,
    snippet: raw.slice(0, 800),
  });
}

/**
 * Server-only: forwards chat to DeepSeek.
 * If `DEEPSEEK_API_KEY` is set on the app server, calls DeepSeek directly (avoids Supabase Edge 429).
 * Otherwise POSTs to Supabase Edge Function `deepseek-chat` from the app runtime (no browser CORS).
 */
export const proxyDeepSeekEdge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messages: unknown; max_tokens?: unknown }) => {
    return assertValidDeepSeekProxyPayload(d);
  })
  .handler(async ({ data, signal }) => {
    const req = getRequest();
    const auth = req?.headers?.get("Authorization") ?? req?.headers?.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      throw new Error("Unauthorized");
    }

    const { messages, max_tokens } = data;
    const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();

    /** Prefer direct DeepSeek on the app server to avoid Supabase Edge rate limits (429). */
    const callDeepSeekDirect = async (): Promise<{ text: string }> => {
      if (!deepseekKey) {
        throw new Error("Missing DEEPSEEK_API_KEY on server");
      }
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          max_tokens,
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
      const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })
        ?.choices;
      const text = choices?.[0]?.message?.content?.trim();
      if (text) return { text };
      console.error("[deepseek-direct] empty choices", {
        status: res.status,
        keys: json && typeof json === "object" ? Object.keys(json as object) : [],
      });
      throw new Error("AI 没有返回内容，再试一次。");
    };

    if (deepseekKey) {
      return await callDeepSeekDirect();
    }

    const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!base || !anon) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY on server");
    }

    const res = await fetch(`${base}/functions/v1/deepseek-chat`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        apikey: anon,
      },
      body: JSON.stringify({ messages, max_tokens }),
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

    const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })
      ?.choices;
    const text = choices?.[0]?.message?.content?.trim();
    if (text) return { text };

    console.error("[deepseek-edge-fn] empty choices", { status: res.status });
    throw new Error("AI 没有返回内容，再试一次。");
  });
