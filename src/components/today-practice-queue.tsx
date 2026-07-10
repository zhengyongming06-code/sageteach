import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Subject } from "@/lib/subjects";
import type { TodayTocSection } from "@/components/today-page-rail";
import {
  fetchDailyTraining,
  knowledgeTrackingQueryKeys,
} from "@/lib/knowledge-tracking/api";
import {
  fetchMistakePatterns,
  knowledgeLocalYmd,
  markDailyTrainingDone,
  SAGE_KNOWLEDGE_REFRESH_EVENT,
} from "@/lib/knowledge-tracking/ingest-client";
import { recordProductAnalyticsEvent } from "@/lib/analytics/api";
import type { DailyTrainingItem } from "@/lib/knowledge-tracking/types";
import type { WeakArchiveRow } from "@/lib/weak-archive";

const VISIBLE_PENDING = 3;

type TodayPracticeQueueProps = {
  userId: string;
  archiveRows: WeakArchiveRow[];
  archiveLoading: boolean;
  archiveError: boolean;
  loadDeadlinePassed: boolean;
  onArchiveComplete: (summaryId: string, completed: boolean) => void;
  celebrateId?: string | null;
  onTocChange?: (sections: TodayTocSection[]) => void;
  onTopTaskChange?: (title: string | null) => void;
};

type QueueItem =
  | {
      kind: "review";
      key: string;
      id: string;
      subject: string;
      title: string;
      meta: string;
      topic: string;
      completed: boolean;
    }
  | {
      kind: "training";
      key: string;
      id: string;
      subject: string;
      title: string;
      meta: string;
      topic: string;
      completed: boolean;
      trainingItem: DailyTrainingItem;
    };

function queueDedupeKey(subject: string, topic: string) {
  return `${subject}\0${topic.trim().toLowerCase()}`;
}

function buildQueue(
  archiveRows: WeakArchiveRow[],
  training: DailyTrainingItem[],
): QueueItem[] {
  const reviewKeys = new Set<string>();
  const items: QueueItem[] = [];

  for (const row of archiveRows) {
    const topic = row.weak_point.trim() || row.tonight_task.trim();
    const key = queueDedupeKey(row.subject, topic);
    reviewKeys.add(key);
    items.push({
      kind: "review",
      key: `review-${row.id}`,
      id: row.id,
      subject: row.subject,
      title: row.tonight_task.trim() || row.weak_point.trim() || "复盘任务",
      meta: `来自复盘 · 卡在 ${row.weak_point.trim() || "—"}`,
      topic: row.weak_point.trim() || row.tonight_task.trim(),
      completed: row.completed,
    });
  }

  for (const item of training) {
    const topic = item.knowledge_point.trim();
    const key = queueDedupeKey(item.subject, topic);
    if (reviewKeys.has(key)) continue;
    items.push({
      kind: "training",
      key: item.id ?? `training-${item.subject}-${topic}`,
      id: item.id ?? key,
      subject: item.subject,
      title: topic,
      meta: `${item.task_type} · 约 ${item.estimated_minutes} 分钟 · 系统推荐`,
      topic,
      completed: item.status === "done",
      trainingItem: item,
    });
  }

  const pending = items.filter((item) => !item.completed);
  const done = items.filter((item) => item.completed);
  pending.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "review" ? -1 : 1;
    return 0;
  });

  return [...pending, ...done];
}

export function TodayPracticeQueue({
  userId,
  archiveRows,
  archiveLoading,
  archiveError,
  loadDeadlinePassed,
  onArchiveComplete,
  celebrateId,
  onTocChange,
  onTopTaskChange,
}: TodayPracticeQueueProps) {
  const qc = useQueryClient();
  const today = knowledgeLocalYmd();
  const [showAllPending, setShowAllPending] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today) });
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

  const { data: patterns = [] } = useQuery({
    queryKey: ["mistake-patterns", userId],
    queryFn: () => fetchMistakePatterns(userId, 3),
    staleTime: 30_000,
  });

  const doneMutation = useMutation({
    mutationFn: markDailyTrainingDone,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today) });
    },
  });

  const queue = useMemo(() => buildQueue(archiveRows, training), [archiveRows, training]);
  const pendingItems = queue.filter((item) => !item.completed);
  const completedItems = queue.filter((item) => item.completed);
  const visiblePending = showAllPending ? pendingItems : pendingItems.slice(0, VISIBLE_PENDING);
  const hiddenPendingCount = Math.max(0, pendingItems.length - VISIBLE_PENDING);

  const topPending = pendingItems[0] ?? null;
  const loading = archiveLoading || trainingLoading;
  const hasContent = queue.length > 0;

  useEffect(() => {
    onTocChange?.(hasContent ? [{ id: "practice", label: "今天练什么" }] : []);
  }, [hasContent, onTocChange]);

  useEffect(() => {
    onTopTaskChange?.(topPending ? topPending.title : null);
  }, [topPending, onTopTaskChange]);

  const patternInsight =
    patterns.length > 0
      ? patterns
          .slice(0, 2)
          .map((p: { label: string; occurrence_count: number }) => `${p.label} ×${p.occurrence_count}`)
          .join(" · ")
      : null;

  if (!hasContent && !loading) {
    return (
      <section id="practice" className="wiki-prose-section">
        <h2 className="wiki-prose-h2">今天练什么</h2>
        <div className="wiki-callout">
          <p className="text-sm leading-relaxed">复盘拍照后，任务会自动出现在这里。</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/app/review" className="wiki-link-text text-sm">
              去复盘拍题 →
            </Link>
            <Link to="/app/diagnostic" className="wiki-link-text text-sm">
              知识点诊断 →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="practice" className="wiki-prose-section">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="wiki-prose-h2">今天练什么</h2>
        <Link to="/app/review" className="wiki-link-text shrink-0 text-sm">
          去复盘 →
        </Link>
      </div>

      {patternInsight ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--wiki-muted)]">
          常错：{patternInsight}
        </p>
      ) : null}

      {archiveError ? (
        <p className="mt-3 text-sm text-destructive">任务加载失败，请刷新页面。</p>
      ) : loading && !loadDeadlinePassed ? (
        <p className="wiki-prose-sub mt-3">加载中…</p>
      ) : loading && loadDeadlinePassed ? (
        <p className="wiki-prose-sub mt-3">加载较慢，请稍后再试。</p>
      ) : pendingItems.length === 0 && completedItems.length === 0 ? (
        <p className="wiki-prose-sub mt-3">还没有任务。</p>
      ) : (
        <>
          {pendingItems.length > 0 ? (
            <ul className="today-practice-list mt-3">
              {visiblePending.map((item) => (
                <PracticeRow
                  key={item.key}
                  item={item}
                  busy={doneMutation.isPending}
                  celebrated={item.kind === "review" && celebrateId === item.id}
                  onComplete={() => {
                    if (item.kind === "review") {
                      onArchiveComplete(item.id, true);
                    } else if (item.trainingItem.id) {
                      doneMutation.mutate(item.trainingItem.id);
                    }
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="wiki-prose-sub mt-3">今天的待办都完成了。</p>
          )}

          {!showAllPending && hiddenPendingCount > 0 ? (
            <button
              type="button"
              className="today-practice-more"
              onClick={() => setShowAllPending(true)}
            >
              还有 {hiddenPendingCount} 项
              <ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}

          {completedItems.length > 0 ? (
            <div className="mt-4">
              <button
                type="button"
                className="today-practice-more"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
              >
                已完成 {completedItems.length} 项
                <ChevronDown
                  className={cn("ml-1 inline h-3.5 w-3.5 transition-transform", showCompleted && "rotate-180")}
                  aria-hidden
                />
              </button>
              {showCompleted ? (
                <ul className="today-practice-list mt-2 opacity-70">
                  {completedItems.map((item) => (
                    <PracticeRow
                      key={item.key}
                      item={item}
                      busy={doneMutation.isPending}
                      onComplete={() => {
                        if (item.kind === "review") {
                          onArchiveComplete(item.id, false);
                        }
                      }}
                      completedMode
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PracticeRow({
  item,
  busy,
  celebrated,
  onComplete,
  completedMode = false,
}: {
  item: QueueItem;
  busy: boolean;
  celebrated?: boolean;
  onComplete: () => void;
  completedMode?: boolean;
}) {
  const learnSearch =
    item.topic.trim().length > 0
      ? { subject: item.subject as Subject, topic: item.topic }
      : { subject: item.subject as Subject };

  return (
    <li className={cn("today-practice-row", item.completed && "today-practice-row-done")}>
      <button
        type="button"
        className={cn("today-practice-check", item.completed && "today-practice-check-done")}
        disabled={busy || (completedMode && item.kind === "training")}
        aria-label={item.completed ? "标记未完成" : "标记完成"}
        onClick={onComplete}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("today-practice-title", item.completed && "line-through")}>
          <span className="wiki-tag mr-1.5 align-middle">{item.subject}</span>
          {item.title}
        </p>
        <p className={cn("today-practice-meta", item.completed && "line-through")}>{item.meta}</p>
        {celebrated ? (
          <p className="mt-1 text-xs text-[var(--wiki-nav-fg)]">✓ 搞定了这个卡点</p>
        ) : null}
      </div>

      {!item.completed ? (
        <Link
          to="/app/learn"
          search={learnSearch}
          className="today-practice-go"
          onClick={() => {
            void recordProductAnalyticsEvent("training_go_click", {
              subject: item.subject,
              knowledge_point: item.topic,
              label: item.title,
              source: item.kind,
            });
          }}
        >
          去练
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}
