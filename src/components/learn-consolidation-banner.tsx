import { RemediationProgressActions } from "@/components/remediation-progress-actions";
import { LearnConsolidationBadge } from "@/components/learn-consolidation-badge";
import {
  consolidationPhaseHint,
  deriveLearnConsolidationPhase,
  type LearnConsolidationPhase,
  type RemediationAction,
  type RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";
import type { KnowledgePointStatus } from "@/lib/knowledge-points";
import { cn } from "@/lib/utils";

type LearnConsolidationBannerProps = {
  phase: LearnConsolidationPhase;
  progress: RemediationProgress;
  status: KnowledgePointStatus;
  masteryScore: number | null;
  onMark: (action: RemediationAction) => Promise<RemediationProgress>;
  className?: string;
};

export function LearnConsolidationBanner({
  phase,
  progress,
  status,
  masteryScore,
  onMark,
  className,
}: LearnConsolidationBannerProps) {
  const livePhase = deriveLearnConsolidationPhase({
    progress,
    status,
    mastery_score: masteryScore,
  });

  return (
    <section className={cn("learn-consolidation-banner", className)}>
      <div className="learn-consolidation-banner-head">
        <LearnConsolidationBadge phase={livePhase} />
        <p className="learn-consolidation-banner-hint">{consolidationPhaseHint(livePhase)}</p>
      </div>
      {livePhase !== "已掌握" ? (
        <RemediationProgressActions progress={progress} onMark={onMark} compact />
      ) : (
        <p className="learn-consolidation-banner-done">✓ 巩固任务已完成</p>
      )}
    </section>
  );
}
