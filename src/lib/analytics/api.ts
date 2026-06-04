import { supabase } from "@/integrations/supabase/client";
import type {
  AnalyticsAiQuality,
  AnalyticsFeedback,
  AnalyticsFunnelStep,
  ProductAnalyticsDashboard,
} from "@/lib/analytics/types";

const DEFAULT_FUNNEL: AnalyticsFunnelStep[] = [
  { key: "photo", label: "拍题", users: 0, rate_from_previous: null },
  { key: "review", label: "Review", users: 0, rate_from_previous: 0 },
  { key: "review_complete", label: "完成 Review", users: 0, rate_from_previous: 0 },
  { key: "training_generated", label: "生成训练", users: 0, rate_from_previous: 0 },
  { key: "training_done", label: "完成训练", users: 0, rate_from_previous: 0 },
];

const EMPTY_AI_QUALITY: AnalyticsAiQuality = {
  photo_analysis_success_rate: 0,
  photo_analysis_attempts: 0,
  photo_analysis_successes: 0,
  ai_output_anomaly_rate: 0,
  ai_output_anomalies: 0,
  knowledge_extraction_success_rate: 0,
  knowledge_extraction_attempts: 0,
  knowledge_extraction_successes: 0,
};

const EMPTY_FEEDBACK: AnalyticsFeedback = {
  top_weak_points: [],
  top_mistake_patterns: [],
  top_training_tasks: [],
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Backfill fields when DB RPC is still on the old dashboard migration. */
export function normalizeProductAnalyticsDashboard(
  raw: unknown,
  days: number,
): ProductAnalyticsDashboard {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rangeRaw = o.range as Record<string, unknown> | undefined;
  const needsValidationMigration = o.ai_quality == null || o.funnel == null;

  const aiRaw = o.ai_quality as Record<string, unknown> | undefined;
  const ai_quality: AnalyticsAiQuality = aiRaw
    ? {
        photo_analysis_success_rate: num(aiRaw.photo_analysis_success_rate),
        photo_analysis_attempts: num(aiRaw.photo_analysis_attempts),
        photo_analysis_successes: num(aiRaw.photo_analysis_successes),
        ai_output_anomaly_rate: num(aiRaw.ai_output_anomaly_rate),
        ai_output_anomalies: num(aiRaw.ai_output_anomalies),
        knowledge_extraction_success_rate: num(aiRaw.knowledge_extraction_success_rate),
        knowledge_extraction_attempts: num(aiRaw.knowledge_extraction_attempts),
        knowledge_extraction_successes: num(aiRaw.knowledge_extraction_successes),
      }
    : { ...EMPTY_AI_QUALITY, photo_analysis_successes: num(o.photo_count) };

  const fbRaw = o.feedback as Record<string, unknown> | undefined;
  const feedback: AnalyticsFeedback = fbRaw
    ? {
        top_weak_points: Array.isArray(fbRaw.top_weak_points) ? fbRaw.top_weak_points : [],
        top_mistake_patterns: Array.isArray(fbRaw.top_mistake_patterns)
          ? fbRaw.top_mistake_patterns
          : [],
        top_training_tasks: Array.isArray(fbRaw.top_training_tasks) ? fbRaw.top_training_tasks : [],
      }
    : EMPTY_FEEDBACK;

  return {
    range: {
      from: String(rangeRaw?.from ?? ""),
      to: String(rangeRaw?.to ?? ""),
      days: num(rangeRaw?.days, days),
    },
    dau: num(o.dau),
    wau: num(o.wau),
    review_completion_rate: num(o.review_completion_rate),
    review_started: num(o.review_started),
    review_completed: num(o.review_completed),
    photo_count: num(o.photo_count),
    daily_training_completion_rate: num(o.daily_training_completion_rate),
    daily_training_total: num(o.daily_training_total),
    daily_training_done: num(o.daily_training_done),
    dau_series: Array.isArray(o.dau_series) ? o.dau_series : [],
    funnel: Array.isArray(o.funnel) ? (o.funnel as AnalyticsFunnelStep[]) : DEFAULT_FUNNEL,
    ai_quality,
    feedback,
    needs_validation_migration: needsValidationMigration,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function formatAnalyticsError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [e.message, e.code ? `(${e.code})` : "", e.details, e.hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return String(error);
}

export async function recordAnalyticsActivity(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await db.rpc("record_analytics_activity");
    if (error) console.warn("[analytics] record_activity", error);
  } catch (e) {
    console.warn("[analytics] record_activity", e);
  }
}

export async function recordProductAnalyticsEvent(
  eventType: string,
  metadata: Record<string, string> = {},
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await db.rpc("record_product_analytics_event", {
      p_event_type: eventType,
      p_metadata: metadata,
    });
    if (error) console.warn("[analytics] record_product_event", eventType, error);
  } catch (e) {
    console.warn("[analytics] record_product_event", eventType, e);
  }
}

export async function checkAnalyticsAdmin(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return false;

    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error) return !!data;

    console.warn("[analytics] is_admin table", error);

    const { data: rpcData, error: rpcError } = await db.rpc("is_analytics_admin");
    if (rpcError) {
      console.warn("[analytics] is_admin rpc", rpcError);
      return false;
    }
    return rpcData === true;
  } catch (e) {
    console.warn("[analytics] is_admin", e);
    return false;
  }
}

export async function fetchProductAnalyticsDashboard(
  days = 30,
): Promise<ProductAnalyticsDashboard> {
  const { data, error } = await db.rpc("get_product_analytics_dashboard", {
    p_days: days,
  });
  if (error) {
    const message = formatAnalyticsError(error);
    if (message.includes("forbidden")) {
      throw new Error("当前账号不是管理员。请在 Supabase 执行 admin_users 插入 SQL。");
    }
    if (error.code === "PGRST202") {
      throw new Error(
        "分析 RPC 未部署。请在 Supabase SQL Editor 执行 product_analytics migration。",
      );
    }
    throw new Error(message);
  }
  return normalizeProductAnalyticsDashboard(data, days);
}

export const analyticsQueryKeys = {
  admin: ["analytics-admin"] as const,
  dashboard: (days: number) => ["analytics-dashboard", days] as const,
};
