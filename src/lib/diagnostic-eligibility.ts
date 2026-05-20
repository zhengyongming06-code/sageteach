import { supabase } from "@/integrations/supabase/client";

export const diagnosticEligibilityQueryKey = (userId: string) =>
  ["diagnostic-eligibility", userId] as const;

export const diagnosticBannerDismissStorageKey = (userId: string) =>
  `sage-diagnostic-banner-dismissed:${userId}`;

/**
 * Show optional diagnostic banner when user has no review summaries
 * and has not started knowledge-point tracking yet.
 */
export async function fetchDiagnosticBannerEligible(userId: string): Promise<boolean> {
  try {
    const [summariesRes, kpRes] = await Promise.all([
      supabase
        .from("review_summaries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("knowledge_points")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    if (summariesRes.error) {
      console.warn("[diagnostic-eligibility] review_summaries", summariesRes.error);
      return false;
    }
    if (kpRes.error) {
      console.warn("[diagnostic-eligibility] knowledge_points", kpRes.error);
      return false;
    }

    const summaryCount = summariesRes.count ?? 0;
    const kpCount = kpRes.count ?? 0;
    return summaryCount === 0 && kpCount === 0;
  } catch (e) {
    console.warn("[diagnostic-eligibility]", e);
    return false;
  }
}
