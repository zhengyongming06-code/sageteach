import type { PhotoKnowledgeExtraction } from "@/lib/knowledge-tracking/types";
import {
  buildKnowledgeRemediationFromExtraction,
  type KnowledgeRemediation,
} from "@/lib/knowledge-topics/recommend";
import {
  buildReviewSummaryInsertRow,
  findExistingReviewSummary,
  persistReviewSummary,
  requireAuthenticatedUserId,
  updateReviewSummaryRow,
} from "@/lib/review-summary-db";

export function buildPhotoWeakPoint(extraction: PhotoKnowledgeExtraction): string {
  const points = (extraction.mapped_knowledge_points ?? extraction.knowledge_points)
    .map((k) => k.trim())
    .filter(Boolean);
  const qt = extraction.question_type?.trim();
  if (qt && qt !== "未分类" && points.length > 0) {
    return `${qt} — ${points.join("、")}`;
  }
  if (points.length > 0) return points.join("、");
  return extraction.question_summary?.trim() || "拍照错题";
}

export function buildPhotoTonightTask(remediation: KnowledgeRemediation): string {
  const kp = remediation.primaryKnowledgePoint;
  const teacher = remediation.videos[0]?.teacher;
  const teacherHint = teacher ? `（推荐 ${teacher}）` : "";
  return `看辅学块「${kp}」推荐视频${teacherHint}，并完成 2 道同类练手题`;
}

/** 拍题识点后写入 review_summaries → 今日页「今晚任务」。 */
export async function persistPhotoKnowledgeToTonightTask(input: {
  subject: string;
  sessionDate: string;
  reviewSessionSlug: string | null;
  extraction: PhotoKnowledgeExtraction;
}): Promise<{ id: string } | null> {
  const points = (input.extraction.mapped_knowledge_points ?? input.extraction.knowledge_points)
    .map((k) => k.trim())
    .filter(Boolean);
  if (points.length === 0) return null;

  const remediation = buildKnowledgeRemediationFromExtraction(input.extraction);
  const weak_point = buildPhotoWeakPoint(input.extraction);
  const tonight_task = remediation
    ? buildPhotoTonightTask(remediation)
    : `复习「${points[0]}」并完成 2 道同类练手题`;

  const userId = await requireAuthenticatedUserId();
  const slug = input.reviewSessionSlug;

  if (slug) {
    const existing = await findExistingReviewSummary(slug);
    if (existing?.id) {
      await updateReviewSummaryRow(existing.id, {
        weak_point,
        tonight_task,
        follow_up: "拍题识点 · 辅学块视频与练题",
      });
      return { id: existing.id };
    }
  }

  const row = buildReviewSummaryInsertRow({
    userId,
    sessionDate: input.sessionDate,
    subject: input.subject,
    reviewSessionSlug: slug,
    parsed: {
      weak_point,
      tonight_task,
      follow_up: "拍题识点 · 辅学块视频与练题",
      mastered: null,
    },
  });

  const { id } = await persistReviewSummary(row);
  return { id };
}
