import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ReviewSummaryCardProps = {
  variant: "full" | "fallback";
  subject?: string;
  weakPoint?: string;
  tonightTask?: string;
  followUp?: string;
  className?: string;
};

export function ReviewSummaryCard({
  variant,
  subject,
  weakPoint,
  tonightTask,
  followUp,
  className,
}: ReviewSummaryCardProps) {
  if (variant === "fallback") {
    return (
      <div
        className={cn(
          "rounded-2xl border-l-4 border-l-primary bg-accent/50 px-4 py-3 text-sm text-foreground shadow-sm",
          className,
        )}
      >
        <p className="font-medium">复盘完成 ✓ 今天辛苦了。</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border border-l-4 border-l-[#4A90E2] bg-[#E8F1FB]/80 px-4 py-3 text-sm shadow-sm dark:bg-[#1e3a5f]/40 dark:border-l-[#4A90E2]",
        className,
      )}
    >
      <p className="mb-2 font-semibold text-foreground">📌 今日复盘小结</p>
      {subject ? (
        <Badge variant="secondary" className="mb-2 font-normal">
          {subject}
        </Badge>
      ) : null}
      <ul className="space-y-1.5 text-foreground/90">
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
      </ul>
    </div>
  );
}
