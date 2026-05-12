import { cn } from "@/lib/utils";
import { subjectAccentCardClass } from "@/lib/subject-accent";

export type ReviewSummaryCardProps = {
  variant: "full" | "fallback";
  subject?: string;
  weakPoint?: string;
  tonightTask?: string;
  followUp?: string;
  mastered?: string | null;
  className?: string;
};

export function ReviewSummaryCard({
  variant,
  subject,
  weakPoint,
  tonightTask,
  followUp,
  mastered,
  className,
}: ReviewSummaryCardProps) {
  if (variant === "fallback") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border border-l-4 border-l-muted-foreground bg-muted/50 px-4 py-3 text-sm text-foreground shadow-sm",
          className,
        )}
      >
        <p className="font-medium">复盘完成 ✓ 今天认真了。明天继续。</p>
      </div>
    );
  }

  const accent = subject ? subjectAccentCardClass(subject) : "border-l-4 border-l-primary bg-primary/[0.06]";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border px-4 py-3 text-sm shadow-sm",
        accent,
        className,
      )}
    >
      <p className="mb-2 font-semibold text-foreground">📌 今日复盘小结</p>
      {subject ? (
        <span
          className={cn(
            "mb-2 inline-block rounded-lg border px-2 py-0.5 text-xs font-medium",
            "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          {subject}
        </span>
      ) : null}
      <ul className="mt-2 space-y-1.5 text-foreground/90">
        <li>
          <span className="text-muted-foreground">卡点：</span>
          {weakPoint}
        </li>
        <li>
          <span className="text-muted-foreground">今晚任务：</span>
          {tonightTask}
        </li>
        <li>
          <span className="text-muted-foreground">下次聊：</span>
          {followUp}
        </li>
        {mastered ? (
          <li className="border-t border-border/60 pt-2 text-emerald-700 dark:text-emerald-400">
            <span className="font-medium">✓ 今天搞懂了：</span>
            {mastered}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
