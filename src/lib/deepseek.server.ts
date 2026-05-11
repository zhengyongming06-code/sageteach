import type { DeepSeekMessage } from "./deepseek";

/**
 * Server-side DeepSeek (Score, etc.). Uses VITE_DEEPSEEK_API_KEY or DEEPSEEK_API_KEY from env.
 */
export async function fetchDeepSeekReplyServer(messages: DeepSeekMessage[]): Promise<string> {
  const key = (process.env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "缺少 DeepSeek API Key：请在环境变量中配置 VITE_DEEPSEEK_API_KEY 或 DEEPSEEK_API_KEY",
    );
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
