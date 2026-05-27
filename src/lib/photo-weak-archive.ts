import {
  buildReviewSummaryInsertRow,
  persistReviewSummary,
  requireAuthenticatedUserId,
} from "@/lib/review-summary-db";

/** Write wrong-answer knowledge points into 卡点档案 (review_summaries). */
export async function persistPhotoWeakPoints(input: {
  subject: string;
  sessionDate: string;
  knowledgePoints: string[];
  reviewSessionSlug: string | null;
}): Promise<void> {
  const points = input.knowledgePoints.map((k) => k.trim()).filter(Boolean);
  if (points.length === 0) return;

  const userId = await requireAuthenticatedUserId();
  const weak_point = points.join("；");
  const row = buildReviewSummaryInsertRow({
    userId,
    sessionDate: input.sessionDate,
    subject: input.subject,
    reviewSessionSlug: input.reviewSessionSlug,
    parsed: {
      weak_point,
      tonight_task: "复习上方知识点并完成同类练习",
      follow_up: "拍照错题巩固",
      mastered: null,
    },
  });

  await persistReviewSummary(row);
}
