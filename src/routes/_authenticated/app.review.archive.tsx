import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { ChevronLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { subjectAccentCardClass } from "@/lib/subject-accent";
import { KnowledgePointDiagnosisSection } from "@/components/knowledge-point-diagnosis-section";
import { knowledgePointsQueryOptions } from "@/lib/knowledge-points-db";
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

type ArchiveTab = "review" | "knowledge";

function ArchiveUnderlineTabs({
  active,
  onChange,
}: {
  active: ArchiveTab;
  onChange: (tab: ArchiveTab) => void;
}) {
  return (
    <div className="flex gap-6 border-b border-border" role="tablist">
      {(
        [
          { id: "review" as const, label: "复盘卡点" },
          { id: "knowledge" as const, label: "知识点" },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px border-b-2 pb-2 text-sm font-medium transition",
            active === tab.id
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ReviewArchive() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ArchiveTab>("review");

  const {
    data: rows = [],
    isPending,
    isError,
  } = useQuery({
    ...weakArchiveQueryOptions(user!.id),
    enabled: !!user?.id,
    refetchOnMount: true,
  });

  const {
    data: knowledgePoints = [],
    isPending: kpPending,
    isError: kpError,
  } = useQuery({
    ...knowledgePointsQueryOptions(user!.id),
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
          复盘卡点来自每次结束复盘；知识点来自诊断测试。
        </p>
      </header>

      <ArchiveUnderlineTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "review" ? (
        <div role="tabpanel" className="space-y-4">
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
                        <time
                          className="text-xs tabular-nums text-muted-foreground"
                          dateTime={r.session_date}
                        >
                          {formatArchiveDateLabel(r.session_date, r.created_at)}
                        </time>
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
      ) : (
        <div role="tabpanel" className="space-y-3">
          <div className="flex justify-end">
            <Link
              to="/app/diagnostic"
              className="text-xs font-medium text-primary hover:underline"
            >
              去做知识点诊断 →
            </Link>
          </div>
          {kpError ? (
            <p className="text-sm text-destructive">知识点加载失败。</p>
          ) : kpPending && knowledgePoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (
            <KnowledgePointDiagnosisSection rows={knowledgePoints} showDiagnosticLink={false} />
          )}
        </div>
      )}
    </div>
  );
}
