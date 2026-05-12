import { supabase } from "@/integrations/supabase/client";

export type WeakArchiveRow = {
  id: string;
  session_date: string;
  subject: string;
  weak_point: string;
  tonight_task: string;
  created_at: string;
  completed: boolean;
};

export async function fetchWeakArchive(userId: string): Promise<WeakArchiveRow[]> {
  const { data: summaries, error: sErr } = await supabase
    .from("review_summaries")
    .select("id,session_date,subject,weak_point,tonight_task,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (sErr) throw sErr;
  const rows = summaries ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: comps, error: cErr } = await supabase
    .from("task_completions")
    .select("review_summary_id,completed")
    .eq("user_id", userId)
    .in("review_summary_id", ids);
  if (cErr) throw cErr;
  const map = new Map((comps ?? []).map((c) => [c.review_summary_id, c.completed]));
  return rows.map((r) => ({
    id: r.id,
    session_date: r.session_date,
    subject: r.subject,
    weak_point: r.weak_point,
    tonight_task: r.tonight_task,
    created_at: r.created_at,
    completed: map.get(r.id) ?? false,
  }));
}

export function formatArchiveDateLabel(sessionDate: string, createdAt: string): string {
  const d = new Date(sessionDate + "T12:00:00");
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
  }
  return new Date(createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function persistTaskCompletion(
  userId: string,
  reviewSummaryId: string,
  completed: boolean,
): Promise<{ error: { message: string } | null }> {
  const updated_at = new Date().toISOString();
  const { data: existing, error: selErr } = await supabase
    .from("task_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("review_summary_id", reviewSummaryId)
    .maybeSingle();
  if (selErr) return { error: selErr };

  if (existing?.id) {
    const { error } = await supabase
      .from("task_completions")
      .update({ completed, updated_at })
      .eq("id", existing.id);
    return { error };
  }

  const { error } = await supabase.from("task_completions").insert({
    user_id: userId,
    review_summary_id: reviewSummaryId,
    completed,
    updated_at,
  });
  return { error };
}
