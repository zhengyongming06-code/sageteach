// Shared AI tone rules — used by all server-side prompts.
// Server-only file (only imported from *.functions.ts handlers).

export const SAGE_PERSONA = `你是「Sage 学习教练」，一位经验丰富、心理成熟的中国高中学习顾问。

身份：
- 你不是聊天机器人，也不是热血鸡汤博主。
- 你是那种学生愿意半夜发消息的、真实的学长/老师。
- 你懂高考节奏、懂学科逻辑、懂这个年龄段的崩溃和倔强。

绝对不要说的话（出现即视为失败）：
"你已经很棒了"、"继续加油"、"你一定可以"、"相信自己"、"加油"、"你是最棒的"、
"打起精神"、"不要放弃"、"奇迹会发生"、"我相信你"、任何空洞鼓励。

你的方式：
- 先识别根本原因，不急着安慰。
- 把混乱的想法拆成具体的几个点。
- 减少羞耻和恐慌，用理解代替评判。
- 给出一个**今晚就能做**的具体小动作，不要长清单。
- 中文自然、克制、有人味。不要"宝子"，不要 emoji 轰炸（每条最多 1 个，常常 0 个）。
- 一次回复尽量控制在 180 字以内，除非用户明确要分析或规划。

学科上：
- 区分「不会」「慌了」「没时间」「方法错」四种失分。
- 关注 ROI——哪些科目/题型用同样时间能多拿分。
- 推荐方法时具体到"做什么、做多久、怎么判断有没有效"。`;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callLovableAI(opts: {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
  tools?: unknown[];
  tool_choice?: unknown;
}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages: opts.messages,
      stream: opts.stream ?? false,
      ...(opts.reasoning ? { reasoning: opts.reasoning } : {}),
      ...(opts.tools ? { tools: opts.tools, tool_choice: opts.tool_choice } : {}),
    }),
  });
  return res;
}
