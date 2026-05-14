import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, accept, prefer, accept-profile",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type DeepSeekRole = "system" | "user" | "assistant";
type DeepSeekMessage = { role: DeepSeekRole; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "Method not allowed" } }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: { message: "Server misconfigured" } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { messages?: DeepSeekMessage[]; max_tokens?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { messages, max_tokens = 1000 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: { message: "messages required" } }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
  if (!apiKey) {
    console.error("[deepseek-chat] DEEPSEEK_API_KEY missing");
    return new Response(JSON.stringify({ error: { message: "服务暂时不可用" } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 115_000);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens,
        stream: false,
      }),
    });

    const rawText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText) as unknown;
    } catch {
      console.error("[deepseek-chat] upstream non-JSON", {
        status: response.status,
        length: rawText.length,
        snippet: rawText.slice(0, 800),
      });
      return new Response(JSON.stringify({ error: { message: "上游返回无效，请稍后重试" } }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      console.error("[deepseek-chat] DeepSeek HTTP error", { status: response.status, body: data });
      const clientStatus = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      return new Response(JSON.stringify({ error: { message: "AI 服务暂时不可用，请稍后重试" } }), {
        status: clientStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    console.error("[deepseek-chat] fetch failed", { isAbort, err: e });
    return new Response(
      JSON.stringify({ error: { message: isAbort ? "请求超时" : "服务暂时不可用" } }),
      {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } finally {
    clearTimeout(timer);
  }
});
