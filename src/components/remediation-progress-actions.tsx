import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  type RemediationAction,
  type RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";
import { cn } from "@/lib/utils";

type RemediationProgressActionsProps = {
  progress: RemediationProgress;
  onMark: (action: RemediationAction) => Promise<RemediationProgress>;
  compact?: boolean;
  className?: string;
};

const TOAST: Record<
  RemediationAction,
  { mark: string; unmark: string }
> = {
  video_watched: {
    mark: "已记录看完视频，进入「掌握中」",
    unmark: "已取消视频标记",
  },
  practice_done: {
    mark: "考点已掌握 ✓",
    unmark: "已取消练完标记",
  },
};

export function RemediationProgressActions({
  progress,
  onMark,
  compact = false,
  className,
}: RemediationProgressActionsProps) {
  const [busy, setBusy] = useState<RemediationAction | null>(null);

  const toggle = async (action: RemediationAction) => {
    if (busy) return;
    const wasMarked = action === "video_watched" ? progress.video_watched : progress.practice_done;
    setBusy(action);
    try {
      await onMark(action);
      toast.success(wasMarked ? TOAST[action].unmark : TOAST[action].mark);
    } catch (e) {
      console.warn("[remediation-progress]", e);
      toast.error("记录失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("remediation-progress-actions", compact && "remediation-progress-actions-compact", className)}>
      <button
        type="button"
        className={cn(
          "remediation-progress-btn",
          progress.video_watched && "remediation-progress-btn-done",
        )}
        disabled={busy !== null}
        aria-pressed={progress.video_watched}
        title={progress.video_watched ? "点击取消标记" : undefined}
        onClick={() => void toggle("video_watched")}
      >
        {busy === "video_watched" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : progress.video_watched ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : null}
        {progress.video_watched ? "已看完视频" : "标记看完视频"}
      </button>
      <button
        type="button"
        className={cn(
          "remediation-progress-btn",
          progress.practice_done && "remediation-progress-btn-done",
        )}
        disabled={busy !== null}
        aria-pressed={progress.practice_done}
        title={progress.practice_done ? "点击取消标记" : undefined}
        onClick={() => void toggle("practice_done")}
      >
        {busy === "practice_done" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : progress.practice_done ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : null}
        {progress.practice_done ? "已练完" : "标记练完"}
      </button>
    </div>
  );
}
