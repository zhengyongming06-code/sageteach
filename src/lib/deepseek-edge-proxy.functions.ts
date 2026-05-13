import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DeepSeekMessage } from "./deepseek-types";

/**
 * Server-only: forwards chat to DeepSeek.
 * If `DEEPSEEK_API_KEY` is set on the app server, calls DeepSeek directly (avoids Supabase Edge 429).
 * Otherwise POSTs to Supabase Edge Function `deepseek-chat` from the app runtime (no browser CORS).
 */
export const proxyDeepSeekEdge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messages: DeepSeekMessage[]; max_tokens?: number }) => {
    if (!Array.isArray(d?.messages)) throw new Error("messages required");
    return d;
  })
  .handler(async ({ data, signal }) => {
    const req = getRequest();
    const auth =
      req?.headers?.get("Authorization") ?? req?.headers?.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      throw new Error("Unauthorized");
    }

    const max_tokens = typeof data.max_tokens === "number" ? data.max_tokens : 1000;
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
          messages: data.messages,
          max_tokens,
          stream: false,
        }),
      });
      const raw = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        throw new Error(raw.slice(0, 240) || "DeepSeek returned non-JSON");
      }
      if (!res.ok) {
        const msg =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as { error?: { message?: string } }).error?.message ?? raw.slice(0, 200))
            : raw.slice(0, 200);
        throw new Error(msg || `DeepSeek HTTP ${res.status}`);
      }
      const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })?.choices;
      const text = choices?.[0]?.message?.content?.trim();
      if (text) return { text };
      const errMsg = (json as { error?: { message?: string } }).error?.message;
      if (errMsg) throw new Error(errMsg);
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
      body: JSON.stringify({ messages: data.messages, max_tokens }),
    });

    const raw = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(raw.slice(0, 240) || "Edge function returned non-JSON");
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" && json !== null && "error" in json
          ? String((json as { error?: { message?: string } }).error?.message ?? raw.slice(0, 200))
          : raw.slice(0, 200);
      throw new Error(msg || `Edge function HTTP ${res.status}`);
    }

    const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> })?.choices;
    const text = choices?.[0]?.message?.content?.trim();
    if (text) return { text };

    const errMsg = (json as { error?: { message?: string } }).error?.message;
    if (errMsg) throw new Error(errMsg);
    throw new Error("AI 没有返回内容，再试一次。");
  });
