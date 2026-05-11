import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Once a probe succeeds, we cache true for the session.
 * We do not cache "columns missing": after a migration, the next probe must run without a full page reload.
 */
let confirmedReviewColumns: boolean | null = null;
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
  if (confirmedReviewColumns === true) return true;
  if (!probePromise) {
    probePromise = (async () => {
      try {
        const { error } = await client.from("coach_messages").select("review_subject").limit(1);
        if (!error) {
          confirmedReviewColumns = true;
          return true;
        }
        if (looksLikeMissingReviewColumnError(error)) {
          return false;
        }
        console.warn("[coach_messages] review column probe:", error.message);
        return false;
      } finally {
        probePromise = null;
      }
    })();
  }
  return probePromise;
}

/** For tests or after applying DB migration without full reload (optional). */
export function resetCoachMessagesSchemaCache() {
  confirmedReviewColumns = null;
  probePromise = null;
}

export const MIGRATION_HINT =
  "请在 Supabase SQL Editor 执行：alter table public.coach_messages add column if not exists review_subject text; add column if not exists review_session_date date;（完整脚本见 supabase/migrations/20260511130000_coach_messages_review_columns.sql）";
