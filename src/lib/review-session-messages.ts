/** Rows from coach_messages used for review chat / DeepSeek history. */
export type ReviewCoachMessageRow = {
  id?: string;
  role: string;
  content: string;
  created_at?: string;
  review_session_slug?: string | null;
  review_subject?: string | null;
};

export function isReviewChatRole(role: string): boolean {
  return role === "user" || role === "assistant";
}

/** Client-side guard: only messages belonging to this exact session + subject. */
export function filterCoachMessagesForSession<T extends ReviewCoachMessageRow>(
  rows: T[],
  sessionSlug: string,
  subject: string,
): T[] {
  return rows.filter(
    (r) =>
      r.review_session_slug === sessionSlug &&
      (r.review_subject == null || r.review_subject === subject) &&
      isReviewChatRole(r.role),
  );
}
