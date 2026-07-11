import type { LearnConsolidationPhase } from "@/lib/knowledge-tracking/remediation-progress";
import { cn } from "@/lib/utils";

const PHASE_CLASS: Record<LearnConsolidationPhase, string> = {
  待巩固: "learn-phase-badge-pending",
  掌握中: "learn-phase-badge-progress",
  已掌握: "learn-phase-badge-done",
};

type LearnConsolidationBadgeProps = {
  phase: LearnConsolidationPhase;
  className?: string;
};

export function LearnConsolidationBadge({ phase, className }: LearnConsolidationBadgeProps) {
  return (
    <span className={cn("learn-phase-badge", PHASE_CLASS[phase], className)}>{phase}</span>
  );
}
