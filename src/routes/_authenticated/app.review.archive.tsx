import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { ChevronLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { subjectAccentCardClass, subjectBadgeClass } from "@/lib/subject-accent";
import {
  formatArchiveDateLabel,
  persistTaskCompletion,
  weakArchiveQueryKey,
  weakArchiveQueryOptions,
  type WeakArchiveRow,
} from "@/lib/weak-archive";

export const Route = createFileRoute("/_authenticated/app/review/archive")({
  component: ReviewArchive,
});

function ReviewArchive() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const {
    data: rows = [],
    isPending,
    isError,
  } = useQuery({
    ...weakArchiveQueryOptions(user!.id),
    enabled: !!user?.id,
    refetchOnMount: true,
  });

  const showInitialLoading = isPending && rows.length === 0;

  const toggleComplete = useCallback(
    async (summaryId: string, completed: boolean) => {
      if (!user?.id) return;
      const prev = qc.getQueryData<WeakArchiveRow[]>(weakArchiveQueryKey(user.id));
      if (prev) {
        qc.setQueryData<WeakArchiveRow[]>(
          weakArchiveQueryKey(user.id),
          prev.map((t) => (t.id === summaryId ? { ...t, completed } : t)),
        );
      }
      const { error } = await persistTaskCompletion(user.id, summaryId, completed);
      if (error) {
        toast.error(error.message);
        await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
        return;
      }
      await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
      await qc.invalidateQueries({ queryKey: ["review-summaries", user.id] });
      await qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
    },
    [user?.id, qc],
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-8">
      <Link
        to="/app/review"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        返回复盘
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">弱点档案</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按时间整理的复盘小结；勾选表示该条卡点已解决。
        </p>
      </header>

      {showInitialLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">加载失败，请稍后重试。</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          还没有复盘记录。完成第一次复盘后，你的弱点档案会出现在这里。
        </p>
      ) : (
        <ul className="relative space-y-4 border-l border-border pl-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
              <div
                className={cn(
                  "overflow-hidden rounded-2xl border border-border py-3 pl-4 pr-3 shadow-sm",
                  subjectAccentCardClass(r.subject),
                )}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <Checkbox
                    id={`arch-page-${r.id}`}
                    checked={r.completed}
                    onCheckedChange={(v) => void toggleComplete(r.id, v === true)}
                    className="mt-0.5 shrink-0"
                    aria-label="标记卡点已解决"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <time className="tabular-nums" dateTime={r.session_date}>
                        {formatArchiveDateLabel(r.session_date, r.created_at)}
                      </time>
                      <span className={subjectBadgeClass(r.subject)}>{r.subject}</span>
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-sm font-medium text-foreground",
                        r.completed && "text-muted-foreground line-through",
                      )}
                    >
                      {r.weak_point}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-sm text-muted-foreground",
                        r.completed && "line-through opacity-80",
                      )}
                    >
                      <span className="text-muted-foreground/80">今晚任务：</span>
                      {r.tonight_task}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
