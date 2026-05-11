import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/review/archive")({
  component: ReviewArchive,
});

function ReviewArchive() {
  const { user } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["review-summaries", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_summaries")
        .select("id,session_date,subject,weak_point,tonight_task,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        to="/app/review"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        返回复盘
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">弱点档案</h1>
        <p className="mt-1 text-sm text-muted-foreground">按时间整理的复盘小结，方便回看。</p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          还没有复盘记录。完成第一次复盘后，你的弱点档案会出现在这里。
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={r.session_date}>
                  {new Date(r.session_date + "T12:00:00").toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <Badge variant="outline" className="text-[11px]">
                  {r.subject}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{r.weak_point}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-muted-foreground/80">今晚任务：</span>
                {r.tonight_task}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
