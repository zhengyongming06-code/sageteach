import { fetchDeepSeekReplyWithTimeout } from "./deepseek";

export const REVIEW_END_KEYWORDS = [
  "差不多了",
  "结束了",
  "结束",
  "好了",
  "我去学了",
  "拜",
  "谢谢",
] as const;

export type ReviewSummaryPayload = {
  subject: string;
  weak_point: string;
  tonight_task: string;
  follow_up: string;
  mastered: string | null;
};

export function userEndsReviewSession(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  return REVIEW_END_KEYWORDS.some((k) => t.includes(k));
}

export function formatReviewConversationForSummary(
  rows: { role: string; content: string }[],
): string {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => `${r.role === "user" ? "学生" : "Sage"}：${r.content}`)
    .join("\n");
}

const SUMMARY_SYSTEM = `You extract structured data from a Chinese tutoring chat. Output ONLY valid JSON, no markdown fences, no other text.`;

export function buildReviewSummaryUserPrompt(conversation: string): string {
  return `Based on this conversation, generate a JSON summary:
{
  "subject": "学科",
  "weak_point": "这次发现的核心知识点漏洞，一句话，要具体到知识点名称",
  "tonight_task": "一个今晚可以完成的具体任务，包含题目数量或时间",
  "follow_up": "下次复盘时Sage要问的一个具体问题",
  "mastered": "这次对话里学生做对了或理解了的知识点，没有则返回null"
}
Return ONLY valid JSON.

Conversation:
${conversation}`;
}

export function parseReviewSummaryJson(raw: string): ReviewSummaryPayload | null {
  let s = raw.trim();
  s = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const subject = String(o.subject ?? "").trim();
    const weak_point = String(o.weak_point ?? "").trim();
    const tonight_task = String(o.tonight_task ?? "").trim();
    const follow_up = String(o.follow_up ?? "").trim();
    if (!subject || !weak_point || !tonight_task || !follow_up) return null;
    let mastered: string | null = null;
    const mRaw = o.mastered;
    if (mRaw != null && mRaw !== "" && String(mRaw).toLowerCase() !== "null") {
      const ms = String(mRaw).trim();
      if (ms) mastered = ms;
    }
    return { subject, weak_point, tonight_task, follow_up, mastered };
  } catch {
    return null;
  }
}

const SUMMARY_TIMEOUT_MS = 10_000;

export async function requestReviewSummaryStructured(
  conversation: string,
): Promise<ReviewSummaryPayload | null> {
  const userContent = buildReviewSummaryUserPrompt(conversation);
  const text = await fetchDeepSeekReplyWithTimeout(
    [
      { role: "system", content: SUMMARY_SYSTEM },
      { role: "user", content: userContent },
    ],
    SUMMARY_TIMEOUT_MS,
  );
  return parseReviewSummaryJson(text);
}
