import { invokeDeepSeekChat } from "./deepseek-supabase";
import { SAGE_EXTRACTION_SAFETY_SUFFIX } from "./ai-safety";
import { stripPhotoContentForChatApi } from "./question-photo-analysis";

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
    .map((r) => {
      const content =
        r.role === "assistant" ? stripPhotoContentForChatApi(r.content) : r.content;
      return `${r.role === "user" ? "学生" : "Sage"}：${content}`;
    })
    .join("\n");
}

const SUMMARY_SYSTEM = `You extract structured data from a Chinese tutoring chat. Output ONLY valid JSON, no markdown fences, no other text.${SAGE_EXTRACTION_SAFETY_SUFFIX}`;

export function buildReviewSummaryUserPrompt(conversation: string): string {
  return `Based on this Chinese high-school tutoring chat, extract a short actionable summary for the student.
Priority: tonight_task must be the most useful field — a concrete assignment they can do tonight (question count, topic, or time box).

Rules:
- tonight_task: one specific action, e.g. "完成 2 道电磁感应综合题，约 25 分钟" or "重做今天卡住的第 3 题并写出完整步骤". Include quantity or duration when possible.
- weak_point: one short phrase (≤24 Chinese chars) naming the knowledge gap; context for the task only.
- follow_up: optional; one short question Sage could ask next time (internal use).
- mastered: only if the student clearly demonstrated understanding in chat; else null.
- Do NOT invent quiz results or assume which option the student picked.
- If tonight's task is unclear, infer the smallest reasonable practice from what was discussed.

{
  "subject": "学科",
  "weak_point": "一句话卡点",
  "tonight_task": "今晚可执行的具体任务",
  "follow_up": "下次复盘要问的一句话，可简短",
  "mastered": null
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
      String(o.follow_up ?? "").trim() ||
      (weak_point ? `上次卡在「${weak_point.slice(0, 20)}」，今天进展如何？` : "今天想先从哪一科开始复盘？");
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

function extractStreamingJsonStringField(raw: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const m = re.exec(raw);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

/** Best-effort parse while JSON is still streaming in. */
export function parsePartialReviewSummaryStream(raw: string): Partial<ReviewSummaryPayload> {
  const partial: Partial<ReviewSummaryPayload> = {};
  const subject = extractStreamingJsonStringField(raw, "subject");
  const weak_point = extractStreamingJsonStringField(raw, "weak_point");
  const tonight_task = extractStreamingJsonStringField(raw, "tonight_task");
  const follow_up = extractStreamingJsonStringField(raw, "follow_up");
  if (subject) partial.subject = subject;
  if (weak_point) partial.weak_point = weak_point;
  if (tonight_task) partial.tonight_task = tonight_task;
  if (follow_up) partial.follow_up = follow_up;

  if (/"mastered"\s*:\s*null/i.test(raw)) {
    partial.mastered = null;
  } else {
    const mastered = extractStreamingJsonStringField(raw, "mastered");
    if (mastered) partial.mastered = mastered;
  }

  return partial;
}

export async function requestReviewSummaryStructured(
  conversation: string,
  options?: {
    onDelta?: (textSoFar: string) => void;
  },
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
      {
        max_tokens: 900,
        timeoutMs: SUMMARY_TIMEOUT_MS,
        onDelta: options?.onDelta,
      },
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
