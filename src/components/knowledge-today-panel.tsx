import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Brain, Check, ChevronRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { subjectAccentCardClass } from "@/lib/subject-accent";
import {
  fetchDailyTraining,
  knowledgeTrackingQueryKeys,
} from "@/lib/knowledge-tracking/api";
import {
  fetchMistakePatterns,
  fetchWeakKnowledgePoints,
  knowledgeLocalYmd,
  markDailyTrainingDone,
  SAGE_KNOWLEDGE_REFRESH_EVENT,
} from "@/lib/knowledge-tracking/ingest-client";
import type { DailyTrainingItem } from "@/lib/knowledge-tracking/types";
import { KNOWLEDGE_POINT_STATUS_DOT_CLASS, type KnowledgePointStatus } from "@/lib/knowledge-points";

type KnowledgeTodayPanelProps = {
  userId: string;
};

export function KnowledgeTodayPanel({ userId }: KnowledgeTodayPanelProps) {
  const qc = useQueryClient();
  const today = knowledgeLocalYmd();

  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today) });
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.mastery(userId) });
      void qc.invalidateQueries({ queryKey: ["mistake-patterns", userId] });
    };
    window.addEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, refresh);
  }, [qc, userId, today]);

  const { data: training = [], isLoading: trainingLoading } = useQuery({
    queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today),
    queryFn: () => fetchDailyTraining(userId, today),
    staleTime: 30_000,
  });

  const { data: weakPoints = [] } = useQuery({
    queryKey: knowledgeTrackingQueryKeys.mastery(userId),
    queryFn: () => fetchWeakKnowledgePoints(userId, 6),
    staleTime: 30_000,
  });

  const { data: patterns = [] } = useQuery({
    queryKey: ["mistake-patterns", userId],
    queryFn: () => fetchMistakePatterns(userId, 4),
    staleTime: 30_000,
  });

  const doneMutation = useMutation({
    mutationFn: markDailyTrainingDone,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today) });
    },
  });

  const hasContent = training.length > 0 || weakPoints.length > 0 || patterns.length > 0;

  if (!hasContent && !trainingLoading) {
    return (
      <section className="shrink-0 rounded-3xl border border-dashed border-border bg-card/60 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">知识状态追踪</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              在复盘里拍照搜题后，Sage 会自动提取知识点、记录错题，并在这里推荐今日训练。
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl">
              <Link to="/app/review">去拍照搜题</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="shrink-0 space-y-4">
      {training.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">今日训练</h2>
            </div>
            <span className="text-xs text-muted-foreground">基于掌握度自动生成</span>
          </div>
          <ul className="mt-3 space-y-2">
            {training.map((item, i) => (
              <TrainingRow
                key={item.id ?? `${item.subject}-${item.knowledge_point}-${i}`}
                item={item}
                onDone={() => item.id && doneMutation.mutate(item.id)}
                busy={doneMutation.isPending}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {weakPoints.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">薄弱知识点</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {weakPoints.map((kp: { subject: string; name: string; status?: string; mastery_score?: number | null }) => (
              <li
                key={`${kp.subject}-${kp.name}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs",
                  subjectAccentCardClass(kp.subject as string),
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    KNOWLEDGE_POINT_STATUS_DOT_CLASS[(kp.status as KnowledgePointStatus) ?? "薄弱"],
                  )}
                />
                <span className="font-medium">{kp.subject}</span>
                <span className="text-muted-foreground">·</span>
                <span>{kp.name}</span>
                {typeof kp.mastery_score === "number" ? (
                  <span className="tabular-nums text-muted-foreground">{Math.round(kp.mastery_score)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {patterns.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">错误模式</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">跨多次错题归纳，不是单题记录</p>
          <ul className="mt-3 space-y-2">
            {patterns.map((p: { subject: string; label: string; occurrence_count: number }) => (
              <li
                key={`${p.subject}-${p.label}`}
                className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">×{p.occurrence_count}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.subject}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function TrainingRow({
  item,
  onDone,
  busy,
}: {
  item: DailyTrainingItem;
  onDone: () => void;
  busy: boolean;
}) {
  const done = item.status === "done";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border px-3 py-2.5",
        subjectAccentCardClass(item.subject),
        done && "opacity-60",
      )}
    >
      <Checkbox
        checked={done}
        disabled={done || busy}
        onCheckedChange={(v) => v === true && onDone()}
        className="mt-0.5"
        aria-label={`完成训练：${item.knowledge_point}`}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "line-through")}>
          {item.subject} · {item.knowledge_point}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.task_type} · 约 {item.estimated_minutes} 分钟
        </p>
      </div>
      {!done ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0 rounded-lg px-2">
          <Link to="/app/review">
            去练
            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : (
        <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      )}
    </li>
  );
}
