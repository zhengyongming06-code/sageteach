import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { subjectAccentTaskClass } from "@/lib/subject-accent";
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

type KnowledgeTodayPanelProps = {
  userId: string;
  onTocChange?: (sections: TodayTocSection[]) => void;
};

export function KnowledgeTodayPanel({ userId, onTocChange }: KnowledgeTodayPanelProps) {
  const qc = useQueryClient();
  const today = knowledgeLocalYmd();

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
    queryFn: () => fetchMistakePatterns(userId, 4),
    staleTime: 30_000,
  });

  const doneMutation = useMutation({
    mutationFn: markDailyTrainingDone,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: knowledgeTrackingQueryKeys.dailyTraining(userId, today) });
    },
  });

  const hasContent = training.length > 0 || patterns.length > 0;

  useEffect(() => {
    if (!onTocChange) return;
    const sections: TodayTocSection[] = [];
    if (training.length > 0) sections.push({ id: "training", label: "今日训练" });
    if (patterns.length > 0) sections.push({ id: "patterns", label: "错误模式" });
    onTocChange(sections);
  }, [training.length, patterns.length, onTocChange]);

  if (!hasContent && !trainingLoading) {
    return (
      <section className="wiki-prose-section">
        <div className="wiki-callout">
          <h2 className="wiki-prose-h2 !mb-2 !text-base">知识状态追踪</h2>
          <p className="wiki-prose-sub">
            在复盘里拍照搜题后，Sage 会自动提取知识点、记录错题，并在这里推荐今日训练。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/app/review" className="wiki-link-text">
              去拍照搜题 →
            </Link>
            <Link to="/app/diagnostic" className="wiki-link-text">
              知识点诊断 →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {training.length > 0 ? (
        <section id="training" className="wiki-prose-section">
          <h2 className="wiki-prose-h2">今日训练</h2>
          <p className="wiki-prose-lead">基于掌握度自动生成</p>
          <ul className="wiki-prose-list">
            {training.map((item, i) => (
              <TrainingRow
                key={item.id ?? `${item.subject}-${item.knowledge_point}-${i}`}
                item={item}
                onDone={() => item.id && doneMutation.mutate(item.id)}
                busy={doneMutation.isPending}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {patterns.length > 0 ? (
        <section id="patterns" className="wiki-prose-section">
          <h2 className="wiki-prose-h2">错误模式</h2>
          <p className="wiki-prose-lead">跨多次错题归纳，不是单题记录</p>
          <ul className="wiki-prose-list">
            {patterns.map((p: { subject: string; label: string; occurrence_count: number }) => (
              <li key={`${p.subject}-${p.label}`} className="wiki-prose-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-[var(--wiki-fg)]">{p.label}</p>
                    <p className="mt-0.5 wiki-prose-sub text-xs">{p.subject}</p>
                  </div>
                  <span className="shrink-0 wiki-prose-sub text-xs tabular-nums">
                    ×{p.occurrence_count}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
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
    <li className={cn(subjectAccentTaskClass(item.subject), done && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium text-[var(--wiki-fg)]", done && "line-through")}>
            {item.subject} · {item.knowledge_point}
          </p>
          <p className="mt-0.5 wiki-prose-sub text-xs">{item.reason}</p>
          <p className="mt-0.5 wiki-prose-sub text-xs">
            {item.task_type} · 约 {item.estimated_minutes} 分钟
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!done ? (
            <>
              <button
                type="button"
                className="wiki-inline-action"
                disabled={busy}
                onClick={onDone}
              >
                标记完成
              </button>
              <Link
                to="/app/review"
                className="wiki-link-text text-xs"
                onClick={() => {
                  void recordProductAnalyticsEvent("training_go_click", {
                    subject: item.subject,
                    task_type: item.task_type,
                    knowledge_point: item.knowledge_point,
                    label: `${item.task_type} · ${item.knowledge_point}`,
                  });
                }}
              >
                去练
                <ChevronRight className="ml-0.5 inline h-3 w-3" />
              </Link>
            </>
          ) : (
            <span className="wiki-prose-sub text-xs">已完成</span>
          )}
        </div>
      </div>
    </li>
  );
}
