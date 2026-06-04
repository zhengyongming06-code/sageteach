/**
 * 每日一问 — 实现保留；Today 页已暂时取消挂载，题目质量改进后再在 app.today.tsx 中恢复 import + JSX。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { subjectBadgeClass } from "@/lib/subject-accent";
import {
  fetchDailyQuestionForDate,
  fetchRecentWeakPoints,
  generateDailyQuestionViaAi,
  gradeDailyAnswerViaAi,
  insertDailyQuestionRow,
  isDailyQuestionsUnavailableError,
  markDailyQuestionComplete,
  type DailyQuestionRow,
} from "@/lib/daily-question";

export type DailyQuestionCardProps = {
  userId: string;
  questionDate: string;
  /** False when user has no review_summaries yet — hide entire card. */
  enabled: boolean;
};

type LoadResult = { unavailable: true } | { unavailable: false; row: DailyQuestionRow | null };

function DailyQuestionSkeleton() {
  return (
    <section
      className="shrink-0 animate-pulse rounded-3xl border border-border bg-card p-4 shadow-sm"
      aria-busy="true"
      aria-label="每日一问加载中"
    >
      <div className="flex gap-2">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-5 w-14 rounded-full bg-muted" />
      </div>
      <div className="mt-4 h-4 w-full rounded bg-muted" />
      <div className="mt-2 h-4 w-[88%] rounded bg-muted" />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="h-10 flex-1 rounded-xl bg-muted" />
        <div className="h-10 w-full rounded-xl bg-muted sm:w-24" />
      </div>
    </section>
  );
}

export function DailyQuestionCard({ userId, questionDate, enabled }: DailyQuestionCardProps) {
  const qc = useQueryClient();
  const qk = useMemo(() => ["daily-question", userId, questionDate] as const, [userId, questionDate]);
  const [answerDraft, setAnswerDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [generating, setGenerating] = useState(false);
  const createAttemptedRef = useRef(false);
  const lastGradeRef = useRef<boolean | null>(null);

  const {
    data: loadResult,
    isLoading,
    isFetched,
    isError,
  } = useQuery({
    queryKey: qk,
    queryFn: async (): Promise<LoadResult> => {
      try {
        const row = await fetchDailyQuestionForDate(userId, questionDate);
        return { unavailable: false, row };
      } catch (e) {
        if (isDailyQuestionsUnavailableError(e)) return { unavailable: true };
        console.warn("[daily_questions] load failed", e);
        return { unavailable: true };
      }
    },
    enabled: enabled && !!userId,
    retry: false,
    staleTime: 60_000,
  });

  const tryCreateRow = useCallback(async () => {
    const weak = await fetchRecentWeakPoints(userId, 5);
    if (weak.length === 0) return "no_weak" as const;
    const gen = await generateDailyQuestionViaAi(weak);
    try {
      const inserted = await insertDailyQuestionRow(userId, questionDate, gen);
      qc.setQueryData(qk, { unavailable: false, row: inserted });
      return "ok" as const;
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
      if (code === "23505") {
        const again = await fetchDailyQuestionForDate(userId, questionDate).catch(() => null);
        if (again) qc.setQueryData(qk, { unavailable: false, row: again });
        return "ok" as const;
      }
      if (isDailyQuestionsUnavailableError(e)) {
        qc.setQueryData(qk, { unavailable: true });
        return "unavailable" as const;
      }
      throw e;
    }
  }, [userId, questionDate, qc, qk]);

  useEffect(() => {
    if (!enabled || !userId || !isFetched || createAttemptedRef.current) return;
    if (!loadResult || loadResult.unavailable) return;
    if (loadResult.row !== null) return;

    createAttemptedRef.current = true;
    setGenerating(true);
    void (async () => {
      try {
        const r = await tryCreateRow();
        if (r === "no_weak") {
          createAttemptedRef.current = false;
        }
      } catch (e) {
        console.warn("[daily_questions] generate failed", e);
        qc.setQueryData(qk, { unavailable: true });
      } finally {
        setGenerating(false);
      }
    })();
  }, [enabled, userId, isFetched, loadResult, tryCreateRow, qc, qk]);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => {
      const ok = lastGradeRef.current;
      qc.setQueryData<LoadResult>(qk, (prev) => {
        if (!prev || prev.unavailable || !prev.row) return prev;
        return { unavailable: false, row: { ...prev.row, completed: true, was_correct: ok ?? false } };
      });
      setCollapsed(true);
      setFeedback(null);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [feedback, qc, qk]);

  if (!enabled) return null;

  if (isLoading || !isFetched) {
    return <DailyQuestionSkeleton />;
  }

  if (isError || !loadResult || loadResult.unavailable) {
    return null;
  }

  if (generating) {
    return <DailyQuestionSkeleton />;
  }

  const r = loadResult.row;
  if (r === null && createAttemptedRef.current) {
    return null;
  }

  if (!r || !String(r.question ?? "").trim() || !String(r.answer ?? "").trim()) {
    return null;
  }

  if (r.completed || collapsed) {
    return (
      <section className="shrink-0 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-2.5 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/25">
        <span className="font-medium text-emerald-800 dark:text-emerald-200">今日已完成 ✓</span>
        <span className="ml-2 text-emerald-900/85 dark:text-emerald-100/80">每日一问</span>
      </section>
    );
  }

  const subjectLabel = String(r.subject ?? "综合");

  const onSubmit = async () => {
    const text = answerDraft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const ok = await gradeDailyAnswerViaAi({
        question: String(r.question),
        correctAnswer: String(r.answer),
        studentAnswer: text,
      });
      await markDailyQuestionComplete(r.id, userId, ok);
      lastGradeRef.current = ok;
      const expl = (r.explanation ?? "").trim() || "再对照一下要点。";
      setFeedback({
        ok,
        text: ok ? expl : `差一点——${expl}`,
      });
      if (ok) {
        setConfetti(true);
        window.setTimeout(() => setConfetti(false), 2000);
      }
    } catch (e) {
      console.warn("[daily_questions] submit failed", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative shrink-0 overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-sm">
      <AnimatePresence>
        {confetti ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 18 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute h-2 w-2 rounded-full bg-amber-400"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: (Math.random() - 0.5) * 220,
                  y: 120 + Math.random() * 80,
                  opacity: 0,
                  rotate: Math.random() * 360,
                }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">每日一问</h2>
        <span className={subjectBadgeClass(subjectLabel)}>{subjectLabel}</span>
      </div>

      {feedback ? (
        <div className="mt-3 space-y-2 text-sm">
          {feedback.ok ? (
            <p className="font-medium text-emerald-600 dark:text-emerald-400">✓ 答对了</p>
          ) : (
            <p className="font-medium text-amber-800 dark:text-amber-200">✗ 再想想</p>
          )}
          <p
            className={cn(
              "leading-relaxed",
              feedback.ok ? "text-foreground/90" : "text-amber-950/90 dark:text-amber-50/90",
            )}
          >
            {feedback.text}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-foreground">{r.question}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={answerDraft}
              onChange={(e) => setAnswerDraft(e.target.value)}
              placeholder="写下你的答案（选择题可填 A/B/C/D）"
              className="rounded-xl sm:flex-1"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onSubmit();
                }
              }}
            />
            <Button
              type="button"
              className="rounded-xl sm:w-auto"
              disabled={!answerDraft.trim() || submitting}
              onClick={() => void onSubmit()}
            >
              提交
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
