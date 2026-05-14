import { invokeDeepSeekChat } from "./deepseek-supabase";

export type ReviewSummaryPayload = {
  subject: string;
  weak_point: string;
  tonight_task: string;
  follow_up: string;
  mastered: string | null;
};

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

/** Strip fences and isolate the first JSON object (models often add text before/after). */
function extractJsonObjectString(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i !== -1 && j > i) return s.slice(i, j + 1);
  return s;
}

export function parseReviewSummaryJson(raw: string): ReviewSummaryPayload | null {
  const s = extractJsonObjectString(raw);
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const subject = String(o.subject ?? "").trim();
    const weak_point = String(o.weak_point ?? "").trim();
    const tonight_task = String(o.tonight_task ?? "").trim();
    const follow_up =
      String(o.follow_up ?? "").trim() || "下次复盘时，想先从哪一块开始聊？";
    if (!weak_point || !tonight_task) return null;
    let mastered: string | null = null;
    const mRaw = o.mastered;
    if (mRaw != null && mRaw !== "" && String(mRaw).toLowerCase() !== "null") {
      const ms = String(mRaw).trim();
      if (ms) mastered = ms;
    }
    return { subject, weak_point, tonight_task, follow_up, mastered };
  } catch (e) {
    console.warn("[review-summary] JSON.parse failed", e, "snippet:", s.slice(0, 400));
    return null;
  }
}

/** Summary extraction can be slower than chat turns; allow enough time for long transcripts. */
const SUMMARY_TIMEOUT_MS = 55_000;

export async function requestReviewSummaryStructured(
  conversation: string,
): Promise<ReviewSummaryPayload | null> {
  console.log("[review-summary] request", {
    conversationChars: conversation.length,
    preview: conversation.slice(0, 280),
  });
  const userContent = buildReviewSummaryUserPrompt(conversation);
  let text: string;
  try {
    text = await invokeDeepSeekChat(
      [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: userContent },
      ],
      { max_tokens: 2000, timeoutMs: SUMMARY_TIMEOUT_MS },
    );
  } catch (e) {
    console.error("[review-summary] DeepSeek request failed", e);
    throw e;
  }
  console.log("[review-summary] raw response", {
    length: text.length,
    preview: text.slice(0, 600),
  });
  const parsed = parseReviewSummaryJson(text);
  if (!parsed) {
    console.warn("[review-summary] parse returned null; raw tail:", text.slice(-400));
  }
  return parsed;
}
