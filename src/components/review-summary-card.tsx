import { useState } from "react";
import { cn } from "@/lib/utils";

function defaultSummaryExpanded() {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 768;
}

export type ReviewSummaryCardProps = {
  variant?: "full" | "skeleton" | "streaming";
  subject?: string;
  weakPoint?: string;
  tonightTask?: string;
  followUp?: string;
  mastered?: string | null;
  className?: string;
};

function SummaryLine({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <li className="space-y-1.5">
        <span className="text-muted-foreground">{label}</span>
        <div className="h-4 w-[92%] max-w-md animate-pulse rounded-md bg-muted/70" />
      </li>
    );
  }
  if (!value) return null;
  return (
    <li>
      <span className="text-muted-foreground">{label}</span>
      {value}
    </li>
  );
}

export function ReviewSummaryCard({
  variant = "full",
  subject,
  weakPoint,
  tonightTask,
  followUp,
  mastered,
  className,
}: ReviewSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultSummaryExpanded);

  const shellClass = cn(
    "rounded-2xl border border-neutral-200 bg-[#FFFFFF] text-sm text-foreground shadow-sm",
    "dark:border-border dark:bg-card",
    isExpanded ? "px-4 py-3" : "px-3 py-2",
    className,
  );

  const toggle = () => setIsExpanded((prev) => !prev);

  if (variant === "skeleton") {
    return (
      <div className={shellClass} aria-busy="true" aria-label="正在生成复盘小结">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left font-semibold text-foreground"
          onClick={toggle}
          aria-expanded={isExpanded}
        >
          <span>📌 今日复盘小结</span>
          <span className="text-muted-foreground" aria-hidden>
            {isExpanded ? "∧" : "∨"}
          </span>
        </button>
        {isExpanded ? (
          <>
            <div className="mb-3 mt-2 h-6 w-20 animate-pulse rounded-lg bg-muted/70" />
            <ul className="mt-2 space-y-3 text-foreground/90">
              <SummaryLine label="卡点：" loading />
              <SummaryLine label="今晚任务：" loading />
              <SummaryLine label="下次聊：" loading />
            </ul>
            <span className="mt-2 inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          </>
        ) : null}
      </div>
    );
  }

  const streaming = variant === "streaming";

  return (
    <div
      className={shellClass}
      aria-busy={streaming ? "true" : undefined}
      aria-label={streaming ? "正在生成复盘小结" : undefined}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left font-semibold text-foreground"
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        <span>📌 今日复盘小结</span>
        <span className="text-muted-foreground" aria-hidden>
          {isExpanded ? "∧" : "∨"}
        </span>
      </button>

      {isExpanded ? (
        <>
          {subject ? (
            <span
              className={cn(
                "mb-2 mt-2 inline-block rounded-lg border px-2 py-0.5 text-xs font-medium",
                "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {subject}
            </span>
          ) : streaming ? (
            <div className="mb-3 mt-2 h-6 w-20 animate-pulse rounded-lg bg-muted/70" />
          ) : null}
          <ul className="mt-2 space-y-1.5 text-foreground/90">
            <SummaryLine label="卡点：" value={weakPoint} loading={streaming && !weakPoint} />
            <SummaryLine
              label="今晚任务："
              value={tonightTask}
              loading={streaming && !tonightTask}
            />
            <SummaryLine label="下次聊：" value={followUp} loading={streaming && !followUp} />
            {mastered ? (
              <li className="border-t border-border/60 pt-2 text-emerald-700 dark:text-emerald-400">
                <span className="font-medium">✓ 今天搞懂了：</span>
                {mastered}
              </li>
            ) : null}
          </ul>
          {streaming ? (
            <span
              className="mt-1 inline-block animate-[sage-cursor_1s_steps(2)_infinite] select-none font-mono text-primary"
              aria-hidden
            >
              ▋
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
