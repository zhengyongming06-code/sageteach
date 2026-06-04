import { supabase } from "@/integrations/supabase/client";
import type { ProductAnalyticsDashboard } from "@/lib/analytics/types";

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
  return data as ProductAnalyticsDashboard;
}

export const analyticsQueryKeys = {
  admin: ["analytics-admin"] as const,
  dashboard: (days: number) => ["analytics-dashboard", days] as const,
};
