import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReviewSummaryCardProps = {
  variant?: "full" | "skeleton" | "streaming";
  subject?: string;
  weakPoint?: string;
  tonightTask?: string;
  /** Kept for API compat; no longer shown in the simplified card. */
  followUp?: string;
  mastered?: string | null;
  className?: string;
  /** Mobile: default collapsed so expanded analysis is not blocked. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

function truncateTask(text: string, max = 28): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ReviewSummaryCard({
  variant = "full",
  subject,
  weakPoint,
  tonightTask,
  mastered,
  className,
  collapsible = false,
  defaultCollapsed = false,
}: ReviewSummaryCardProps) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);

  const shellClass = cn(
    "rounded-2xl border border-primary/20 bg-primary/[0.04] text-sm text-foreground shadow-sm",
    "dark:border-primary/25 dark:bg-primary/[0.08]",
    className,
  );

  if (variant === "skeleton") {
    return (
      <div className={cn(shellClass, "px-4 py-3.5")} aria-busy="true" aria-label="正在整理今晚任务">
        <p className="text-xs font-semibold tracking-wide text-primary">今晚就做这个</p>
        <div className="mt-2.5 h-5 w-[88%] animate-pulse rounded-md bg-muted/70" />
        <div className="mt-2 h-3.5 w-[55%] animate-pulse rounded-md bg-muted/50" />
      </div>
    );
  }

  const streaming = variant === "streaming";
  const hasTask = Boolean(tonightTask?.trim());
  const preview = hasTask ? truncateTask(tonightTask!) : streaming ? "整理中…" : "查看今晚任务";

  if (collapsible && collapsed) {
    return (
      <button
        type="button"
        className={cn(
          shellClass,
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-primary/[0.07]",
        )}
        aria-expanded={false}
        onClick={() => setCollapsed(false)}
      >
        <span className="shrink-0 text-xs font-semibold tracking-wide text-primary">今晚就做这个</span>
        {subject ? (
          <span className="shrink-0 rounded-md border border-primary/20 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {subject}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cn(shellClass, "px-4 py-3.5")}
      aria-busy={streaming ? "true" : undefined}
      aria-label={streaming ? "正在整理今晚任务" : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-primary">今晚就做这个</p>
            {subject ? (
              <span className="rounded-md border border-primary/20 bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {subject}
              </span>
            ) : streaming ? (
              <span className="inline-block h-5 w-12 animate-pulse rounded-md bg-muted/70" />
            ) : null}
          </div>
        </div>
        {collapsible ? (
          <button
            type="button"
            className="review-summary-collapse-btn"
            aria-expanded={true}
            aria-label="收起今晚任务"
            onClick={() => setCollapsed(true)}
          >
            <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
          </button>
        ) : null}
      </div>

      {hasTask ? (
        <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground">{tonightTask}</p>
      ) : streaming ? (
        <div className="mt-2.5 h-5 w-[88%] animate-pulse rounded-md bg-muted/70" />
      ) : (
        <p className="mt-2 text-muted-foreground">暂无具体任务，继续聊几句再整理。</p>
      )}

      {weakPoint ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-muted-foreground/90">卡在 </span>
          {weakPoint}
        </p>
      ) : streaming && hasTask ? (
        <div className="mt-2 h-3.5 w-[55%] animate-pulse rounded-md bg-muted/50" />
      ) : null}

      {mastered ? (
        <p className="mt-2.5 border-t border-border/50 pt-2 text-xs text-emerald-700 dark:text-emerald-400">
          ✓ 今天搞懂了：{mastered}
        </p>
      ) : null}

      {streaming ? (
        <span
          className="mt-1 inline-block animate-[sage-cursor_1s_steps(2)_infinite] select-none font-mono text-primary"
          aria-hidden
        >
          ▋
        </span>
      ) : null}
    </div>
  );
}
