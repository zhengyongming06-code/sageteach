import type { KnowledgePointStatus } from "@/lib/knowledge-points";
import type { MasteryEventType } from "@/lib/knowledge-tracking/types";

/** 默认先验分（无历史时视为「未充分验证的中等水平」） */
export const MASTERY_PRIOR = 50;

/** 超过此天数未练习，分数向先验回归 */
export const MASTERY_DECAY_HALF_LIFE_DAYS = 14;

/** 各事件对 mastery_score 的增量（0–100 量表） */
export const MASTERY_EVENT_DELTA: Record<MasteryEventType, number> = {
  photo_wrong: -12,
  photo_quiz_wrong: -8,
  photo_quiz_correct: +10,
  diagnostic_wrong: -18,
  diagnostic_correct: +15,
  review_mastered: +20,
  manual_adjust: 0,
};

/** 连续答对加成：第 n 次连对额外 +min(n, 3) */
export function streakBonus(streakAfterEvent: number): number {
  return Math.min(Math.max(streakAfterEvent, 0), 3);
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/** 时间衰减：向先验回归 */
export function applyTimeDecay(
  score: number,
  lastEventAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastEventAt) return score;
  const days = (now.getTime() - lastEventAt.getTime()) / 86_400_000;
  if (days <= 0) return score;
  const decay = Math.pow(0.5, days / MASTERY_DECAY_HALF_LIFE_DAYS);
  return clampScore(MASTERY_PRIOR + (score - MASTERY_PRIOR) * decay);
}

export function scoreToStatus(score: number | null): KnowledgePointStatus {
  if (score === null) return "未测试";
  if (score < 30) return "薄弱";
  if (score < 70) return "掌握中";
  return "已掌握";
}

export type ApplyEventInput = {
  currentScore: number | null;
  streakCorrect: number;
  eventType: MasteryEventType;
  customDelta?: number;
  lastEventAt?: Date | null;
  now?: Date;
};

export type ApplyEventOutput = {
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  status: KnowledgePointStatus;
  streakCorrect: number;
};

/**
 * 掌握度计算公式（客户端预览 / Edge Function 共用）：
 *
 * 1. score_decayed = decay(current, last_event_at)
 * 2. delta = EVENT_DELTA[type] + (delta>0 ? streakBonus : 0)
 * 3. score_after = clamp(score_decayed + delta)
 */
export function applyMasteryEvent(input: ApplyEventInput): ApplyEventOutput {
  const now = input.now ?? new Date();
  const base = applyTimeDecay(
    input.currentScore ?? MASTERY_PRIOR,
    input.lastEventAt ?? null,
    now,
  );
  const baseDelta = input.customDelta ?? MASTERY_EVENT_DELTA[input.eventType];
  const bonus =
    baseDelta > 0 ? streakBonus(input.streakCorrect + 1) : 0;
  const delta = baseDelta + bonus;
  const scoreAfter = clampScore(base + delta);
  const streakCorrect =
    baseDelta > 0 ? input.streakCorrect + 1 : 0;

  return {
    scoreBefore: base,
    scoreAfter,
    delta,
    status: scoreToStatus(scoreAfter),
    streakCorrect,
  };
}

/** 弱点优先级：分数越低、最近错题越多，优先级越高 */
export function weaknessPriority(input: {
  mastery_score: number | null;
  wrong_count: number;
  last_wrong_at: string | null;
}): number {
  const score = input.mastery_score ?? MASTERY_PRIOR;
  const scoreFactor = 100 - score;
  const wrongFactor = Math.min(input.wrong_count, 5) * 8;
  let recencyFactor = 0;
  if (input.last_wrong_at) {
    const days =
      (Date.now() - new Date(input.last_wrong_at).getTime()) / 86_400_000;
    recencyFactor = days <= 1 ? 20 : days <= 7 ? 10 : 0;
  }
  return clampScore(scoreFactor + wrongFactor + recencyFactor);
}
