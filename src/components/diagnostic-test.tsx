import { useCallback, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import { subjectBadgeClass } from "@/lib/subject-accent";
import {
  DIAGNOSTIC_QUESTION_COUNT,
  getTotalKnowledgePointsForSubject,
  pickKnowledgePointsForDiagnosticRound,
  type UserGrade,
} from "@/lib/knowledge-points";
import { DiagnosticMathText } from "@/components/diagnostic-math-text";
import {
  DIAGNOSTIC_DIFFICULTY_OPTIONS,
  generateDiagnosticQuestionsForSubject,
  isAnswerCorrect,
  type DiagnosticDifficulty,
  type DiagnosticQuestion,
} from "@/lib/diagnostic-questions";
import { saveDiagnosticResults, type DiagnosticAnswerRow } from "@/lib/diagnostic-db";
import { diagnosticEligibilityQueryKey } from "@/lib/diagnostic-eligibility";
import {
  fetchUserKnowledgePoints,
  knowledgePointsQueryKey,
} from "@/lib/knowledge-points-db";
import {
  GRADE_OPTIONS,
  profileGradeQueryKey,
  profileGradeQueryOptions,
  updateProfileGrade,
} from "@/lib/profile-grade";

type Phase =
  | "pick-grade"
  | "pick-difficulty"
  | "pick-subject"
  | "generating"
  | "quiz"
  | "summary"
  | "saving";

type AnswerRecord = {
  knowledge_point: string;
  is_correct: boolean;
  selected: string;
};

export type DiagnosticTestProps = {
  userId: string;
  onSaved?: () => void;
};

function buildExcludeSet(
  subject: Subject,
  sessionAnswers: AnswerRecord[],
  dbTested: ReadonlySet<string>,
): Set<string> {
  const exclude = new Set(dbTested);
  for (const a of sessionAnswers) {
    if (a.knowledge_point) exclude.add(a.knowledge_point);
  }
  return exclude;
}

export function DiagnosticTest({ userId, onSaved }: DiagnosticTestProps) {
  const qc = useQueryClient();
  const { data: userGrade, isLoading: gradeLoading } = useQuery(profileGradeQueryOptions(userId));

  const [phase, setPhase] = useState<Phase>("pick-difficulty");
  const [difficulty, setDifficulty] = useState<DiagnosticDifficulty | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<AnswerRecord[]>([]);
  const [dbTestedKps, setDbTestedKps] = useState<Set<string>>(new Set());
  const [genError, setGenError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [justSavedSubject, setJustSavedSubject] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const effectivePhase = useMemo((): Phase => {
    if (!gradeLoading && !userGrade && phase !== "pick-grade" && phase !== "saving") {
      return "pick-grade";
    }
    return phase;
  }, [gradeLoading, userGrade, phase]);

  const resetToPickSubject = useCallback(() => {
    setPhase(userGrade ? "pick-subject" : "pick-grade");
    setSubject(null);
    setQuestions([]);
    setQIndex(0);
    setSelectedOption(null);
    setShowFeedback(false);
    setSessionAnswers([]);
    setDbTestedKps(new Set());
    setGenProgress(null);
  }, [userGrade]);

  const startRound = useCallback(
    async (sub: Subject, grade: UserGrade) => {
      setJustSavedSubject(null);
      setSubject(sub);
      setPhase("generating");
      setGenError(null);
      setQuestions([]);
      setQIndex(0);
      setSelectedOption(null);
      setShowFeedback(false);

      const kpRows = await fetchUserKnowledgePoints(userId, grade);
      const dbTested = new Set(
        kpRows
          .filter((r) => r.subject === sub && r.status !== "未测试")
          .map((r) => r.name),
      );
      setDbTestedKps(dbTested);
      const exclude = buildExcludeSet(sub, sessionAnswers, dbTested);
      const kps = pickKnowledgePointsForDiagnosticRound(sub, grade, exclude, DIAGNOSTIC_QUESTION_COUNT);

      if (kps.length === 0) {
        toast.message("该科目在当前年级下的知识点已全部测完");
        setPhase("pick-subject");
        return;
      }

      setGenProgress({ done: 0, total: kps.length });

      try {
        if (!difficulty) throw new Error("请先选择难度");
        const qs = await generateDiagnosticQuestionsForSubject(sub, kps, difficulty, {
          onProgress: (done, total) => setGenProgress({ done, total }),
        });
        setQuestions(qs);
        setGenProgress(null);
        setPhase("quiz");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "出题失败，请重试";
        setGenError(msg);
        setGenProgress(null);
        setPhase("pick-subject");
        toast.error(msg);
      }
    },
    [difficulty, sessionAnswers, userId],
  );

  const handlePickGrade = async (grade: UserGrade) => {
    setSavingGrade(true);
    try {
      await updateProfileGrade(userId, grade);
      await qc.invalidateQueries({ queryKey: profileGradeQueryKey(userId) });
      setPhase("pick-difficulty");
      toast.success("年级已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存年级失败");
    } finally {
      setSavingGrade(false);
    }
  };

  const startGeneration = useCallback(
    (sub: Subject) => {
      if (!userGrade) {
        setPhase("pick-grade");
        return;
      }
      void startRound(sub, userGrade);
    },
    [userGrade, startRound],
  );

  const difficultyLabel =
    DIAGNOSTIC_DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.title ?? null;

  const current = questions[qIndex];

  const pickOption = (option: string) => {
    if (!current || showFeedback) return;
    setSelectedOption(option);
    setShowFeedback(true);
    const correct = isAnswerCorrect(option, current.answer);
    setSessionAnswers((prev) => [
      ...prev,
      {
        knowledge_point: current.knowledge_point,
        is_correct: correct,
        selected: option,
      },
    ]);
  };

  const goNext = () => {
    if (qIndex + 1 >= questions.length) {
      setPhase("summary");
      return;
    }
    setQIndex((i) => i + 1);
    setSelectedOption(null);
    setShowFeedback(false);
  };

  const summaryStats = useMemo(() => {
    if (!subject || !userGrade) {
      return {
        total: 0,
        testedCount: 0,
        remaining: 0,
        canContinue: false,
      };
    }
    const total = getTotalKnowledgePointsForSubject(subject, userGrade);
    const testedUnion = new Set(dbTestedKps);
    for (const a of sessionAnswers) testedUnion.add(a.knowledge_point);
    const testedCount = testedUnion.size;
    const remaining = Math.max(0, total - testedCount);
    const canContinue = remaining > 0;
    return { total, testedCount, remaining, canContinue };
  }, [subject, userGrade, sessionAnswers, dbTestedKps]);

  const weak = sessionAnswers.filter((a) => !a.is_correct);
  const strong = sessionAnswers.filter((a) => a.is_correct);

  const handleSave = async () => {
    if (!subject || !userGrade || sessionAnswers.length === 0) return;
    setPhase("saving");
    try {
      const rows: DiagnosticAnswerRow[] = sessionAnswers.map((a) => ({
        knowledge_point: a.knowledge_point,
        is_correct: a.is_correct,
      }));
      await saveDiagnosticResults(userId, subject, rows, userGrade);
      await Promise.all([
        qc.invalidateQueries({ queryKey: diagnosticEligibilityQueryKey(userId) }),
        qc.invalidateQueries({ queryKey: knowledgePointsQueryKey(userId) }),
      ]);
      toast.success("已保存到知识点档案");
      onSaved?.();
      setJustSavedSubject(subject);
      setSessionAnswers([]);
      setDbTestedKps(new Set());
      resetToPickSubject();
    } catch (e) {
      console.error("[diagnostic] save failed", e);
      toast.error(e instanceof Error ? e.message : "保存失败");
      setPhase("summary");
    }
  };

  const handleContinue = () => {
    if (!subject || !userGrade) return;
    void startRound(subject, userGrade);
  };

  if (gradeLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (effectivePhase === "pick-grade") {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">先告诉我你的年级</h2>
          <p className="text-sm text-muted-foreground">先告诉我你的年级，我来出对应的题。</p>
        </header>
        <div className="grid grid-cols-2 gap-2">
          {GRADE_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              disabled={savingGrade}
              onClick={() => void handlePickGrade(g)}
              className={cn(
                "rounded-2xl border border-border bg-card px-4 py-4 text-base font-medium transition",
                "hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (effectivePhase === "pick-difficulty") {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">选择诊断难度</h2>
          <p className="text-sm text-muted-foreground">
            {userGrade ? `当前年级：${userGrade} · ` : ""}
            先选难度，再选科目；每轮测 {DIAGNOSTIC_QUESTION_COUNT} 个知识点。
          </p>
        </header>
        <button
          type="button"
          onClick={() => setPhase("pick-grade")}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← 更换年级
        </button>
        <div className="space-y-3">
          {DIAGNOSTIC_DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setDifficulty(opt.id);
                setPhase("pick-subject");
              }}
              className={cn(
                "w-full rounded-2xl border border-border bg-card px-4 py-4 text-left transition",
                "hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]",
              )}
            >
              <p className="text-base font-semibold text-foreground">{opt.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (effectivePhase === "pick-subject") {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">知识点诊断</h2>
          <p className="text-sm text-muted-foreground">
            {difficultyLabel ? `当前：${difficultyLabel} · ` : ""}
            {userGrade ? `${userGrade} · ` : ""}
            每轮抽 {DIAGNOSTIC_QUESTION_COUNT} 个知识点，可分批测完。
          </p>
        </header>

        <button
          type="button"
          onClick={() => setPhase("pick-difficulty")}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← 更换难度
        </button>

        {justSavedSubject ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            「{justSavedSubject}」已保存。可继续选择其他科目诊断。
          </p>
        ) : null}

        {genError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {genError}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => startGeneration(s)}
              className={cn(
                "rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium transition",
                "hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (effectivePhase === "generating") {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">Sage 正在出题…</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {difficultyLabel ? (
            <span className="rounded-lg border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
              {difficultyLabel}
            </span>
          ) : null}
          {subject ? <span className={subjectBadgeClass(subject)}>{subject}</span> : null}
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">
          {genProgress
            ? `正在出题 ${genProgress.done}/${genProgress.total}...`
            : `正在出题…`}
        </p>
      </div>
    );
  }

  if (effectivePhase === "summary") {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">诊断结果</h2>
          {subject ? (
            <span className={cn(subjectBadgeClass(subject), "inline-block")}>{subject}</span>
          ) : null}
        </header>

        <p className="text-sm text-muted-foreground">
          已测 {summaryStats.testedCount}/{summaryStats.total} 个知识点
          {summaryStats.remaining > 0 ? `，还有 ${summaryStats.remaining} 个未测` : "，本轮已全部测完"}
        </p>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-destructive">需要加强</h3>
          {weak.length === 0 ? (
            <p className="text-sm text-muted-foreground">本轮没有明显薄弱点，继续保持。</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {weak.map((a) => (
                <li
                  key={a.knowledge_point}
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
                  {a.knowledge_point}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-emerald-700 dark:text-emerald-400">掌握不错</h3>
          {strong.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无答对的知识点记录。</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {strong.map((a) => (
                <li
                  key={a.knowledge_point}
                  className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  {a.knowledge_point}
                </li>
              ))}
            </ul>
          )}
        </section>

        {summaryStats.remaining > 0 ? (
          <p className="text-xs text-muted-foreground">未测试：还有 {summaryStats.remaining} 个知识点</p>
        ) : null}

        {summaryStats.canContinue ? (
          <Button type="button" className="w-full rounded-xl" onClick={handleContinue}>
            继续诊断下一批
          </Button>
        ) : null}

        <Button type="button" className="w-full rounded-xl" variant="default" onClick={() => void handleSave()}>
          <Sparkles className="mr-2 h-4 w-4" />
          保存并结束
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full rounded-xl"
          onClick={() => {
            resetToPickSubject();
            toast.message("未保存本轮结果，可换一科继续测");
          }}
        >
          测其他科目（不保存本轮）
        </Button>
      </div>
    );
  }

  if (effectivePhase === "saving") {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在保存…</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">题目加载异常</p>
        <Button type="button" variant="outline" onClick={() => setPhase("pick-subject")}>
          重新选择科目
        </Button>
        <Button type="button" variant="ghost" onClick={() => setPhase("pick-difficulty")}>
          重新选择难度
        </Button>
      </div>
    );
  }

  const feedbackCorrect =
    selectedOption != null && isAnswerCorrect(selectedOption, current.answer);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {subject ? <span className={subjectBadgeClass(subject)}>{subject}</span> : <span />}
        <span>
          第 {qIndex + 1} / {questions.length} 题
        </span>
      </div>

      <p className="text-xs font-medium text-primary">{current.knowledge_point}</p>
      <p className="text-base font-medium leading-relaxed text-foreground">
        <DiagnosticMathText>{current.question}</DiagnosticMathText>
      </p>

      <div className="grid gap-2">
        {current.options.map((opt) => {
          const letter = opt.trim().charAt(0).toUpperCase();
          const isSelected = selectedOption === opt;
          const isCorrectOpt = letter === current.answer.toUpperCase().charAt(0);
          let variant = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if (showFeedback && isSelected) {
            variant = feedbackCorrect
              ? "border-emerald-500/50 bg-emerald-500/10"
              : "border-destructive/50 bg-destructive/10";
          } else if (showFeedback && isCorrectOpt && !feedbackCorrect) {
            variant = "border-emerald-500/40 bg-emerald-500/5";
          }

          return (
            <button
              key={opt}
              type="button"
              disabled={showFeedback}
              onClick={() => pickOption(opt)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition disabled:opacity-90",
                variant,
              )}
            >
              <DiagnosticMathText>{opt}</DiagnosticMathText>
            </button>
          );
        })}
      </div>

      {showFeedback ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            feedbackCorrect
              ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
              : "border-destructive/30 bg-destructive/5 text-foreground",
          )}
        >
          <p className="font-medium">{feedbackCorrect ? "回答正确" : "回答错误"}</p>
          <p className="mt-2 text-muted-foreground">
            <DiagnosticMathText>{current.explanation}</DiagnosticMathText>
          </p>
        </div>
      ) : null}

      {showFeedback ? (
        <Button type="button" className="w-full rounded-xl" onClick={goNext}>
          {qIndex + 1 >= questions.length ? "查看结果" : "下一题"}
        </Button>
      ) : null}
    </div>
  );
}
