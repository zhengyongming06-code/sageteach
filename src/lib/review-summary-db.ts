import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { ReviewSummaryPayload } from "./review-summary";
import { logSupabaseError } from "./supabase-errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewSummaryInsert = Database["public"]["Tables"]["review_summaries"]["Insert"];

/** Ensure JWT is on the shared client before any RLS-protected write. */
export async function requireAuthenticatedUserId(
  client: SupabaseClient<Database> = supabase,
): Promise<string> {
  const {
    data: { session },
    error: sessionErr,
  } = await client.auth.getSession();
  if (sessionErr) {
    console.error("[supabase] getSession failed", sessionErr);
    throw sessionErr;
  }
  if (!session?.access_token) {
    throw new Error("未登录：无法保存复盘总结（缺少 access_token）");
  }

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr) {
    console.error("[supabase] getUser failed", userErr);
    throw userErr;
  }
  if (!user?.id) {
    throw new Error("未登录：无法保存复盘总结（getUser 无 user）");
  }

  return user.id;
}

export function buildReviewSummaryInsertRow(input: {
  userId: string;
  sessionDate: string;
  subject: string;
  parsed: ReviewSummaryPayload;
  reviewSessionSlug: string | null;
}): ReviewSummaryInsert {
  const { userId, sessionDate, subject, parsed, reviewSessionSlug } = input;

  const row: ReviewSummaryInsert = {
    user_id: userId,
    session_date: sessionDate,
    subject: subject.slice(0, 200) || "未分类",
    weak_point: parsed.weak_point.slice(0, 4000),
    tonight_task: parsed.tonight_task.slice(0, 4000),
    follow_up: parsed.follow_up.slice(0, 2000),
  };

  if (parsed.mastered) {
    row.mastered = parsed.mastered.slice(0, 2000);
  }

  if (reviewSessionSlug && UUID_RE.test(reviewSessionSlug)) {
    row.review_session_slug = reviewSessionSlug;
  } else if (reviewSessionSlug) {
    console.warn("[review-summary] invalid review_session_slug, omitting", { reviewSessionSlug });
  }

  return row;
}

function isUnknownColumnError(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST204" || /Could not find the .* column/i.test(error.message ?? "");
}

/**
 * Insert into review_summaries using the shared authenticated Supabase client.
 */
export async function persistReviewSummary(
  row: ReviewSummaryInsert,
  client: SupabaseClient<Database> = supabase,
): Promise<{ id: string }> {
  const userId = await requireAuthenticatedUserId(client);
  if (row.user_id !== userId) {
    console.warn("[review-summary] user_id corrected from auth.getUser()", {
      payloadUserId: row.user_id,
      authUserId: userId,
    });
    row = { ...row, user_id: userId };
  }

  if (!row.session_date) {
    throw new Error("review_summaries insert: session_date is required");
  }

  console.log("[review-summary] insert payload", row);

  const attemptInsert = async (payload: ReviewSummaryInsert) =>
    client.from("review_summaries").insert(payload).select("id").single();

  let { data, error } = await attemptInsert(row);

  if (error && isUnknownColumnError(error)) {
    logSupabaseError("review-summary insert (full row)", error, { payload: row });
    const minimal: ReviewSummaryInsert = {
      user_id: row.user_id,
      session_date: row.session_date,
      subject: row.subject,
      weak_point: row.weak_point,
      tonight_task: row.tonight_task,
      follow_up: row.follow_up,
    };
    console.warn("[review-summary] retry insert without optional columns", minimal);
    ({ data, error } = await attemptInsert(minimal));
  }

  if (error) {
    logSupabaseError("review-summary insert", error, { payload: row });
    throw error;
  }

  if (!data?.id) {
    throw new Error("review_summaries insert returned no id");
  }

  return { id: data.id };
}
