import { supabase } from "@/integrations/supabase/client";
import {
  getReviewDailySession,
  setReviewDailySession,
  type ReviewDailySession,
} from "@/lib/review-daily-session";
import { createSafeStorage, type SafeStorageAdapter } from "@/lib/safe-storage";

const defaultStore = createSafeStorage(
  typeof localStorage !== "undefined" ? localStorage : undefined,
);

/** Latest coach_messages row for subject + calendar day (Asia/Shanghai date string). */
export async function fetchTodayReviewSessionSlug(
  userId: string,
  subject: string,
  todayYmd: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("coach_messages")
      .select("review_session_slug")
      .eq("user_id", userId)
      .eq("review_subject", subject)
      .eq("review_session_date", todayYmd)
      .not("review_session_slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[review-session] fetchTodayReviewSessionSlug", error);
      return null;
    }
    const slug = data?.review_session_slug;
    return typeof slug === "string" && slug.length > 0 ? slug : null;
  } catch (e) {
    console.warn("[review-session] fetchTodayReviewSessionSlug", e);
    return null;
  }
}

export async function resolveReviewSessionSlug(
  userId: string | undefined,
  subject: string,
  todayYmd: string,
  cached?: Pick<ReviewDailySession, "slug"> | null,
  store: SafeStorageAdapter = defaultStore,
): Promise<string | null> {
  const local = getReviewDailySession(subject, todayYmd, store);
  if (local) return local;

  if (cached?.slug) return cached.slug;

  if (!userId) return null;

  const fromDb = await fetchTodayReviewSessionSlug(userId, subject, todayYmd);
  if (fromDb) {
    setReviewDailySession(subject, todayYmd, fromDb, store);
  }
  return fromDb;
}
