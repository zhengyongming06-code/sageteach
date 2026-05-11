import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** True when coach_messages has review_subject + review_session_date (migration applied). */
let cachedHasReviewColumns: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

function looksLikeMissingReviewColumnError(err: {
  message?: string;
  code?: string;
  details?: string;
}): boolean {
  const blob = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    err.code === "42703" ||
    blob.includes("review_subject") ||
    blob.includes("review_session_date") ||
    (blob.includes("column") && blob.includes("does not exist"))
  );
}

/**
 * Detects extended coach_messages columns. Cached for the session so we don't re-probe every request.
 * If the probe fails for an unknown reason, we prefer legacy mode (narrower payloads) to avoid 400s.
 */
export async function coachMessagesHasReviewColumns(client: Client): Promise<boolean> {
  if (cachedHasReviewColumns !== null) return cachedHasReviewColumns;
  if (!probePromise) {
    probePromise = (async () => {
      const { error } = await client.from("coach_messages").select("review_subject").limit(1);
      if (!error) {
        cachedHasReviewColumns = true;
        return true;
      }
      if (looksLikeMissingReviewColumnError(error)) {
        cachedHasReviewColumns = false;
        return false;
      }
      console.warn("[coach_messages] review column probe:", error.message);
      cachedHasReviewColumns = false;
      return false;
    })();
  }
  return probePromise;
}

/** For tests or after applying DB migration without full reload (optional). */
export function resetCoachMessagesSchemaCache() {
  cachedHasReviewColumns = null;
  probePromise = null;
}

export const MIGRATION_HINT =
  "请在 Supabase SQL Editor 执行：alter table public.coach_messages add column if not exists review_subject text; add column if not exists review_session_date date;（完整脚本见 supabase/migrations/20260511130000_coach_messages_review_columns.sql）";
