import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  diagnosticBannerDismissStorageKey,
  diagnosticEligibilityQueryKey,
  fetchDiagnosticBannerEligible,
} from "@/lib/diagnostic-eligibility";
import { Sparkles, Clock, Target, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  gradientBorderInnerClass,
  gradientBorderWrapperClass,
  NEUTRAL_GRADIENT_ACCENT,
  SAGE_HOOK_GRADIENT_ACCENT,
  SKY_DIAGNOSTIC_GRADIENT_ACCENT,
  subjectAccentCardClasses,
  subjectAccentTaskClasses,
} from "@/lib/subject-accent";
import {
  fetchWeakArchive,
  formatArchiveDateLabel,
  persistTaskCompletion,
  weakArchiveQueryKey,
  weakArchiveQueryOptions,
  type WeakArchiveRow,
} from "@/lib/weak-archive";
import { fetchUserExams, pickNearestExam, syncProfileNearestExam, type UserExamRow } from "@/lib/user-exams";
import { raceQueryTimeout } from "@/lib/query-timeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// import { DailyQuestionCard } from "@/components/daily-question-card";

export const Route = createFileRoute("/_authenticated/app/today")({ component: Today });

const TODAY_FETCH_MS = 1500;

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchTodayDailyProgress(userId: string): Promise<{ subjectCount: number; clearedCount: number }> {
  try {
    const todayYmd = localYmd();
    const { data: summaries, error } = await supabase
      .from("review_summaries")
      .select("subject")
      .eq("user_id", userId)
      .eq("session_date", todayYmd);
    if (error) throw error;
    const subjects = new Set((summaries ?? []).map((r) => r.subject).filter(Boolean));

    const { data: comps, error: e2 } = await supabase
      .from("task_completions")
      .select("updated_at")
      .eq("user_id", userId)
      .eq("completed", true);
    if (e2) throw e2;
    const [y, mo, da] = todayYmd.split("-").map(Number);
    const clearedCount = (comps ?? []).filter((r) => {
      const dt = new Date(r.updated_at);
      return dt.getFullYear() === y && dt.getMonth() + 1 === mo && dt.getDate() === da;
    }).length;

    return { subjectCount: subjects.size, clearedCount };
  } catch (e) {
    console.warn("[today-daily-progress]", e);
    return { subjectCount: 0, clearedCount: 0 };
  }
}

async function fetchPendingSageHook(userId: string): Promise<string | null> {
  try {
    const todayYmd = localYmd();
    const { data, error } = await supabase
      .from("review_summaries")
      .select("follow_up")
      .eq("user_id", userId)
      .not("follow_up", "is", null)
      .neq("follow_up", "")
      .lt("session_date", todayYmd)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const t = data?.follow_up?.trim();
    return t && t.length > 0 ? t : null;
  } catch (e) {
    console.warn("[today-sage-hook]", e);
    return null;
  }
}

type ProfileRow = {
  display_name?: string | null;
  current_score?: number | null;
  target_score?: number | null;
};

type EditingField = "target" | "current" | null;

const SPRINT_EXAM_MAX_DAYS = 30;

type TodayTaskRow = {
  id: string;
  subject: string;
  tonight_task: string;
  completed: boolean;
};

async function fetchTodayTasks(userId: string, opts?: { limit?: number }): Promise<TodayTaskRow[]> {
  try {
    const cap = opts?.limit ?? 3;
    const { data: summaries, error: sErr } = await supabase
      .from("review_summaries")
      .select("id,subject,tonight_task,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24);
    if (sErr) throw sErr;
    const trimmed = (summaries ?? []).filter((r) => String(r.tonight_task ?? "").trim() !== "");
    const top = trimmed.slice(0, cap);
    if (top.length === 0) return [];
    const ids = top.map((r) => r.id);
    const { data: comps, error: cErr } = await supabase
      .from("task_completions")
      .select("review_summary_id,completed")
      .eq("user_id", userId)
      .in("review_summary_id", ids);
    if (cErr) throw cErr;
    const map = new Map((comps ?? []).map((c) => [c.review_summary_id, c.completed]));
    return top.map((r) => ({
      id: r.id,
      subject: r.subject,
      tonight_task: String(r.tonight_task).trim(),
      completed: map.get(r.id) ?? false,
    }));
  } catch (e) {
    console.warn("[today-tasks]", e);
    return [];
  }
}

function Today() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState<EditingField>(null);
  const [editDraft, setEditDraft] = useState("");
  const skipBlurSave = useRef(false);
  const [archiveCelebrateId, setArchiveCelebrateId] = useState<string | null>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [diagnosticBannerDismissed, setDiagnosticBannerDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setDiagnosticBannerDismissed(false);
      return;
    }
    setDiagnosticBannerDismissed(
      sessionStorage.getItem(diagnosticBannerDismissStorageKey(user.id)) === "1",
    );
  }, [user?.id]);

  const { data: examRows = [] } = useQuery({
    queryKey: ["user-exams", user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, [], async () => {
        try {
          return await fetchUserExams(user!.id);
        } catch {
          return [];
        }
      }),
    staleTime: 30_000,
  });

  const nearestExam = useMemo(() => pickNearestExam(examRows), [examRows]);
  const examCountdownDays = nearestExam?.days ?? null;
  const examCountdownName = nearestExam?.row.name ?? "考试";
  const examUrgent = examCountdownDays !== null && examCountdownDays >= 0 && examCountdownDays < 7;
  const examSprint =
    examCountdownDays !== null && examCountdownDays >= 0 && examCountdownDays <= SPRINT_EXAM_MAX_DAYS;

  const [examScheduleOpen, setExamScheduleOpen] = useState(false);

  const { data: profileFlags, isFetched: profileFlagsFetched } = useQuery({
    queryKey: ["profile-flags", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async (): Promise<{ needsGuidedReviewOnboarding: boolean }> => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("review_onboarding_complete")
          .eq("id", user!.id)
          .maybeSingle();
        if (error) {
          console.warn("[profiles] today profile flags skipped", error);
          return { needsGuidedReviewOnboarding: false };
        }
        return { needsGuidedReviewOnboarding: data?.review_onboarding_complete === false };
      } catch (e) {
        console.warn("[profiles] today profile flags skipped", e);
        return { needsGuidedReviewOnboarding: false };
      }
    },
  });

  const [loadDeadlinePassed, setLoadDeadlinePassed] = useState(false);
  useEffect(() => {
    if (!user?.id) {
      setLoadDeadlinePassed(false);
      return;
    }
    setLoadDeadlinePassed(false);
    const t = window.setTimeout(() => setLoadDeadlinePassed(true), TODAY_FETCH_MS);
    return () => window.clearTimeout(t);
  }, [user?.id]);

  const { data: summaryCount, isSuccess: summaryCountReady, isError: summaryCountError } = useQuery({
    queryKey: ["review-summary-meta", user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, 0, async () => {
        try {
          const { count, error } = await supabase
            .from("review_summaries")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user!.id);
          if (error) throw error;
          return count ?? 0;
        } catch (e) {
          console.warn("[review-summary-meta]", e);
          return 0;
        }
      }),
  });

  useEffect(() => {
    const onRefresh = () => {
      if (!user?.id) return;
      void qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
      void qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
      void qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] });
      void qc.invalidateQueries({ queryKey: ["user-exams", user.id] });
      void qc.invalidateQueries({ queryKey: diagnosticEligibilityQueryKey(user.id) });
      void qc.invalidateQueries({ queryKey: ["knowledge-points", user.id] });
    };
    window.addEventListener("sage-weak-archive-refresh", onRefresh);
    return () => window.removeEventListener("sage-weak-archive-refresh", onRefresh);
  }, [user?.id, qc]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,current_score,target_score")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("[profiles] today loadProfile", error);
        setProfile({});
        return;
      }
      setProfile(data ?? {});
    } catch (e) {
      console.warn("[profiles] today loadProfile", e);
      setProfile({});
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const {
    data: tasks = [],
    isLoading: tasksLoading,
    isError: tasksError,
  } = useQuery({
    queryKey: ["today-tasks", user?.id, examSprint ? 1 : 3],
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, [], () =>
        fetchTodayTasks(user!.id, { limit: examSprint ? 1 : 3 }),
      ),
  });

  const {
    data: archiveRows = [],
    isLoading: archiveLoading,
    isError: archiveError,
  } = useQuery({
    ...weakArchiveQueryOptions(user!.id),
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, [], async () => {
        try {
          return await fetchWeakArchive(user!.id);
        } catch (e) {
          console.warn("[weak-point-archive]", e);
          return [];
        }
      }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const {
    data: dailyProgress,
    isLoading: dailyProgressLoading,
    isError: dailyProgressError,
  } = useQuery({
    queryKey: ["today-daily-progress", user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, { subjectCount: 0, clearedCount: 0 }, () =>
        fetchTodayDailyProgress(user!.id),
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const { data: pendingFollowUp } = useQuery({
    queryKey: ["today-sage-hook", user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, null, () => fetchPendingSageHook(user!.id)),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const { data: diagnosticBannerEligible = false } = useQuery({
    queryKey: diagnosticEligibilityQueryKey(user?.id ?? ""),
    enabled: !!user?.id,
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, false, () => fetchDiagnosticBannerEligible(user!.id)),
    staleTime: 60_000,
  });

  const showDiagnosticBanner =
    !!user?.id && diagnosticBannerEligible && !diagnosticBannerDismissed;

  const dismissDiagnosticBanner = useCallback(() => {
    if (!user?.id) return;
    sessionStorage.setItem(diagnosticBannerDismissStorageKey(user.id), "1");
    setDiagnosticBannerDismissed(true);
  }, [user?.id]);

  const hour = new Date().getHours();
  const greet =
    hour < 6
      ? "深夜了"
      : hour < 11
        ? "早上好"
        : hour < 14
          ? "中午好"
          : hour < 19
            ? "下午好"
            : "晚上好";

  const beginEdit = (field: NonNullable<EditingField>) => {
    setEditing(field);
    if (field === "target") {
      setEditDraft(profile?.target_score != null ? String(profile.target_score) : "");
    } else {
      setEditDraft(profile?.current_score != null ? String(profile.current_score) : "");
    }
  };

  const cancelEdit = () => {
    skipBlurSave.current = true;
    setEditing(null);
    setEditDraft("");
  };

  const saveField = useCallback(
    async (field: NonNullable<EditingField>) => {
      if (skipBlurSave.current) {
        skipBlurSave.current = false;
        return;
      }
      if (!user?.id || editing !== field) return;
      try {
        if (field === "target") {
          const v = editDraft.trim();
          let target_score: number | null = null;
          if (v !== "") {
            const n = parseInt(v, 10);
            if (Number.isNaN(n) || n < 0 || n > 900) {
              toast.error("请输入 0–900 之间的目标分，或留空");
              return;
            }
            target_score = n;
          }
          const { error } = await supabase
            .from("profiles")
            .update({ target_score })
            .eq("id", user.id);
          if (error) throw error;
          setProfile((p) => (p ? { ...p, target_score } : p));
        } else {
          const v = editDraft.trim();
          let current_score: number | null = null;
          if (v !== "") {
            const n = parseInt(v, 10);
            if (Number.isNaN(n) || n < 0 || n > 900) {
              toast.error("请输入 0–900 之间的分数，或留空");
              return;
            }
            current_score = n;
          }
          const { error } = await supabase
            .from("profiles")
            .update({ current_score })
            .eq("id", user.id);
          if (error) throw error;
          setProfile((p) => (p ? { ...p, current_score } : p));
        }
        setEditing(null);
        setEditDraft("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    },
    [user?.id, editing, editDraft],
  );

  const toggleTaskComplete = useCallback(
    async (summaryId: string, completed: boolean) => {
      if (!user?.id) return;
      const prev = qc.getQueryData<TodayTaskRow[]>(["today-tasks", user.id]);
      if (prev) {
        qc.setQueryData<TodayTaskRow[]>(
          ["today-tasks", user.id],
          prev.map((t) => (t.id === summaryId ? { ...t, completed } : t)),
        );
      }
      const prevArch = qc.getQueryData<WeakArchiveRow[]>(["weak-point-archive", user.id]);
      if (prevArch) {
        qc.setQueryData<WeakArchiveRow[]>(
          ["weak-point-archive", user.id],
          prevArch.map((t) => (t.id === summaryId ? { ...t, completed } : t)),
        );
      }
      const { error } = await persistTaskCompletion(user.id, summaryId, completed);
      if (error) {
        toast.error(error.message);
        await qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
        await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
        return;
      }
      await qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
      await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
      await qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] });
      await qc.invalidateQueries({ queryKey: ["today-sage-hook", user.id] });
    },
    [user?.id, qc],
  );

  const onArchiveCheck = useCallback(
    (summaryId: string, completed: boolean) => {
      void toggleTaskComplete(summaryId, completed);
      if (completed) {
        setArchiveCelebrateId(summaryId);
        if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
        celebrateTimerRef.current = setTimeout(() => {
          setArchiveCelebrateId(null);
          celebrateTimerRef.current = null;
        }, 2000);
      } else {
        setArchiveCelebrateId((cur) => (cur === summaryId ? null : cur));
        if (celebrateTimerRef.current) {
          clearTimeout(celebrateTimerRef.current);
          celebrateTimerRef.current = null;
        }
      }
    },
    [toggleTaskComplete],
  );

  // const showDailyQuestion = summaryCountReady && !summaryCountError && (summaryCount ?? 0) > 0;

  const progressGradient = {
    wrapper: gradientBorderWrapperClass(NEUTRAL_GRADIENT_ACCENT),
    inner: gradientBorderInnerClass(NEUTRAL_GRADIENT_ACCENT, "px-4 py-3 text-center text-sm text-foreground"),
  };
  const sageHookGradient = {
    wrapper: gradientBorderWrapperClass(SAGE_HOOK_GRADIENT_ACCENT),
    inner: gradientBorderInnerClass(SAGE_HOOK_GRADIENT_ACCENT),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-[#FFFFFF] max-md:gap-4">
      <header className="shrink-0">
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {examSprint ? `还有 ${examCountdownDays} 天。今天只做一件事。` : "今天，从最重要的一件事开始。"}
        </h1>
        {examSprint ? (
          <span className="mt-2 inline-flex rounded-full border border-amber-400/70 bg-amber-100/90 px-3 py-0.5 text-xs font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50">
            冲刺模式
          </span>
        ) : null}
      </header>

      <div className="grid shrink-0 grid-cols-3 gap-3">
        <StatCard
          icon={Target}
          label="目标分"
          display={profile?.target_score != null ? `${profile.target_score}` : "—"}
          hint="点击编辑"
          active={editing === "target"}
          draft={editDraft}
          onDraftChange={setEditDraft}
          onActivate={() => beginEdit("target")}
          onSave={() => void saveField("target")}
          onCancel={cancelEdit}
          inputMode="numeric"
          placeholder="分数"
        />
        <StatCard
          icon={Sparkles}
          label="当前分"
          display={profile?.current_score != null ? `${profile.current_score}` : "—"}
          hint="点击编辑"
          active={editing === "current"}
          draft={editDraft}
          onDraftChange={setEditDraft}
          onActivate={() => beginEdit("current")}
          onSave={() => void saveField("current")}
          onCancel={cancelEdit}
          inputMode="numeric"
          placeholder="分数"
        />
        <ExamCountdownCard
          examName={examCountdownName}
          days={examCountdownDays}
          urgent={examUrgent}
          onOpenSchedule={() => setExamScheduleOpen(true)}
        />
      </div>

      <div className="flex flex-col gap-6 max-md:gap-0">
      <section className={progressGradient.wrapper} aria-label="今日进度">
        <div className={progressGradient.inner}>
        {dailyProgressError ? (
          <span className="text-destructive">今日进度加载失败</span>
        ) : dailyProgress != null ? (
          <span className="font-medium tabular-nums">
            今日复盘 {dailyProgress.subjectCount} 科 · 卡点攻克 {dailyProgress.clearedCount} 个
          </span>
        ) : loadDeadlinePassed && dailyProgressLoading ? (
          <span className="text-muted-foreground">今日进度加载较慢，可稍后再试或刷新页面。</span>
        ) : dailyProgressLoading ? (
          <span className="text-muted-foreground">今日进度加载中…</span>
        ) : (
          <span className="font-medium tabular-nums">
            今日复盘 0 科 · 卡点攻克 0 个
          </span>
        )}
        </div>
      </section>

      {showDiagnosticBanner ? (
        <section
          className={gradientBorderWrapperClass(SKY_DIAGNOSTIC_GRADIENT_ACCENT)}
          aria-label="知识点诊断"
        >
          <div className={cn(gradientBorderInnerClass(SKY_DIAGNOSTIC_GRADIENT_ACCENT), "relative")}>
          <button
            type="button"
            onClick={dismissDiagnosticBanner}
            className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
            aria-label="关闭提示"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="pr-8 text-sm leading-relaxed text-sky-950 dark:text-sky-50">
            做个知识点诊断，Sage 按全科考点帮你找出最需要补的部分
            <ChevronRight className="ml-0.5 inline h-4 w-4 align-text-bottom" aria-hidden />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild className="rounded-xl" size="sm">
              <Link to="/app/diagnostic">开始诊断</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground"
              onClick={dismissDiagnosticBanner}
            >
              稍后再说
            </Button>
          </div>
          </div>
        </section>
      ) : null}

      {pendingFollowUp ? (
        <section className={sageHookGradient.wrapper} aria-label="Sage 跟进">
          <div className={sageHookGradient.inner}>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">Sage 在等你汇报</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/95 dark:text-amber-100/90">
            {pendingFollowUp}
          </p>
          <Button asChild className="mt-4 rounded-xl" size="sm" variant="secondary">
            <Link to="/app/review">去复盘 →</Link>
          </Button>
          </div>
        </section>
      ) : null}

      {/* 每日一问：暂时关闭（题目质量优化后再开）。保留实现于 components/daily-question-card.tsx + lib/daily-question.ts
      {user?.id ? (
        <DailyQuestionCard userId={user.id} questionDate={localYmd()} enabled={showDailyQuestion} />
      ) : null}
      */}

      <section className={gradientBorderWrapperClass(NEUTRAL_GRADIENT_ACCENT)}>
        <div className={gradientBorderInnerClass(NEUTRAL_GRADIENT_ACCENT)}>
        <h2 className="text-sm font-semibold tracking-tight">今日任务</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">来自最近一次复盘的「今晚任务」，最多显示 3 条。</p>

        {tasksError ? (
          <p className="mt-4 text-sm text-destructive">
            任务加载失败。若刚部署数据库，请先执行迁移（含 task_completions 表）。
          </p>
        ) : tasksLoading && !loadDeadlinePassed ? (
          <p className="mt-4 text-sm text-muted-foreground">加载任务…</p>
        ) : tasksLoading && loadDeadlinePassed ? (
          <p className="mt-4 text-sm text-muted-foreground">任务加载较慢，请稍后再试或刷新页面。</p>
        ) : tasks.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-white/60 p-5 text-center">
            <p className="text-sm text-foreground">
              还没有今日任务。去复盘一科，Sage 会告诉你今晚该做什么。
            </p>
            <Button asChild className="mt-4 rounded-xl" size="sm">
              <Link to="/app/review">开始复盘 →</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-4 max-md:-mx-5 md:-mx-1">
            {tasks.map((t) => {
              const taskStyle = subjectAccentTaskClasses(t.subject);
              return (
              <li key={t.id} className={taskStyle.wrapper}>
                <div className={cn(taskStyle.inner, "flex items-start gap-3")}>
                <Checkbox
                  id={`task-${t.id}`}
                  checked={t.completed}
                  onCheckedChange={(v) => void toggleTaskComplete(t.id, v === true)}
                  className="mt-1 shrink-0"
                  aria-label={`标记完成：${t.subject}`}
                />
                <label htmlFor={`task-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <p
                    className={cn(
                      "text-sm leading-relaxed text-foreground",
                      t.completed && "text-muted-foreground line-through",
                    )}
                  >
                    {t.tonight_task}
                  </p>
                </label>
                </div>
              </li>
            );
            })}
          </ul>
        )}
        </div>
      </section>

      <section className={gradientBorderWrapperClass(NEUTRAL_GRADIENT_ACCENT)}>
        <div className={gradientBorderInnerClass(NEUTRAL_GRADIENT_ACCENT)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">我的卡点档案</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              按时间整理的复盘小结，勾选表示这个卡点已搞定。
            </p>
          </div>
          <Link
            to="/app/diagnostic"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            知识点诊断 →
          </Link>
        </div>

        {archiveError ? (
          <p className="mt-4 text-sm text-destructive">卡点档案加载失败。</p>
        ) : archiveLoading && !loadDeadlinePassed ? (
          <p className="mt-4 text-sm text-muted-foreground">加载档案…</p>
        ) : archiveLoading && loadDeadlinePassed ? (
          <p className="mt-4 text-sm text-muted-foreground">档案加载较慢，请稍后再试或刷新页面。</p>
        ) : archiveRows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border/80 bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
            还没有卡点记录。完成第一次复盘后，你的档案会出现在这里。
          </p>
        ) : (
          <ul className="relative mt-4 max-md:-mx-5 md:-mx-1 md:space-y-3 md:border-l md:border-border/60 md:pl-4">
            {archiveRows.map((r) => {
              const cardStyle = subjectAccentCardClasses(r.subject, false);
              return (
              <li key={r.id} className="relative md:pl-0">
                <span className="absolute -left-[21px] top-3 hidden h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/50 md:block" />
                <div className={cardStyle.wrapper}>
                <div className={cardStyle.inner}>
                  <div className="flex flex-wrap items-start gap-2">
                    <Checkbox
                      id={`arch-${r.id}`}
                      checked={r.completed}
                      onCheckedChange={(v) => onArchiveCheck(r.id, v === true)}
                      className="mt-0.5 shrink-0"
                      aria-label={`标记卡点已解决：${r.subject}`}
                    />
                    <div className="min-w-0 flex-1">
                      <time
                        className="text-xs tabular-nums text-muted-foreground"
                        dateTime={r.session_date}
                      >
                        {formatArchiveDateLabel(r.session_date, r.created_at)}
                      </time>
                      <p
                        className={cn(
                          "mt-2 text-sm font-medium text-foreground",
                          r.completed && "text-muted-foreground line-through",
                        )}
                      >
                        {r.weak_point}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-sm text-muted-foreground",
                          r.completed && "line-through opacity-80",
                        )}
                      >
                        <span className="text-muted-foreground/80">今晚任务：</span>
                        {r.tonight_task}
                      </p>
                      {archiveCelebrateId === r.id ? (
                        <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          ✓ 搞定了这个卡点 🎯
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                </div>
              </li>
            );
            })}
          </ul>
        )}
        </div>
      </section>

      </div>

      {user?.id ? (
        <ExamScheduleDialog open={examScheduleOpen} onOpenChange={setExamScheduleOpen} userId={user.id} />
      ) : null}
    </div>
  );
}

function ExamCountdownCard({
  examName,
  days,
  urgent,
  onOpenSchedule,
}: {
  examName: string;
  days: number | null;
  urgent: boolean;
  onOpenSchedule: () => void;
}) {
  const line =
    days === null
      ? "添加考试日程"
      : days < 0
        ? `${examName} 已过 ${-days} 天`
        : `距${examName} ${days} 天`;
  const sub =
    days === null
      ? "点击设置考试名称与日期"
      : "以最近一场为准 · 可管理多场考试";

  return (
    <button
      type="button"
      onClick={onOpenSchedule}
      className={cn(
        "w-full rounded-2xl border border-border bg-card p-4 text-left outline-none transition hover:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-amber-500/55 bg-amber-500/[0.08] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        倒计时
      </div>
      <div className="mt-1 text-lg font-semibold leading-snug tabular-nums">{line}</div>
      <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>
    </button>
  );
}

function ExamScheduleDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["user-exams", userId],
    queryFn: () =>
      raceQueryTimeout(TODAY_FETCH_MS, [], async () => {
        try {
          return await fetchUserExams(userId);
        } catch {
          return [];
        }
      }),
    enabled: open && !!userId,
  });
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormName("");
      setFormDate("");
      setEditingId(null);
    }
  }, [open]);

  const invalidateExamData = () => {
    void qc.invalidateQueries({ queryKey: ["user-exams", userId] });
    void qc.invalidateQueries({ queryKey: ["today-tasks", userId] });
  };

  const saveForm = async () => {
    const n = formName.trim();
    if (!n || !formDate) {
      toast.error("请填写考试名称和日期");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("user_exams")
          .update({ name: n, exam_date: formDate })
          .eq("id", editingId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_exams").insert({
          user_id: userId,
          name: n,
          exam_date: formDate,
        });
        if (error) throw error;
      }
      await syncProfileNearestExam(userId);
      invalidateExamData();
      setFormName("");
      setFormDate("");
      setEditingId(null);
      toast.success(editingId ? "已更新" : "已添加");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const removeExam = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("user_exams").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      await syncProfileNearestExam(userId);
      invalidateExamData();
      if (editingId === id) {
        setEditingId(null);
        setFormName("");
        setFormDate("");
      }
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: UserExamRow) => {
    setEditingId(r.id);
    setFormName(r.name);
    setFormDate(r.exam_date.slice(0, 10));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>考试与倒计时</DialogTitle>
          <DialogDescription>管理多场考试；Today 页倒计时显示最近一场。</DialogDescription>
        </DialogHeader>

        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2 text-sm">
          {rows.length === 0 ? (
            <li className="px-2 py-3 text-muted-foreground">暂无记录，请在下方添加。</li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent bg-card px-2 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{r.exam_date.slice(0, 10)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2 text-xs" disabled={busy} onClick={() => startEdit(r)}>
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg px-2 text-xs text-destructive"
                    disabled={busy}
                    onClick={() => void removeExam(r.id)}
                  >
                    删除
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">{editingId ? "编辑考试" : "添加考试"}</p>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="考试名称"
            className="rounded-xl"
          />
          <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="rounded-xl" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="rounded-xl" disabled={busy} onClick={() => void saveForm()}>
              {editingId ? "保存修改" : "添加"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                disabled={busy}
                onClick={() => {
                  setEditingId(null);
                  setFormName("");
                  setFormDate("");
                }}
              >
                取消编辑
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  display,
  hint,
  active,
  draft,
  onDraftChange,
  onActivate,
  onSave,
  onCancel,
  inputMode,
  placeholder,
}: {
  icon: typeof Target;
  label: string;
  display: string;
  hint: string;
  active: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onActivate: () => void;
  onSave: () => void;
  onCancel: () => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) {
      queueMicrotask(() => inputRef.current?.focus());
      inputRef.current?.select();
    }
  }, [active]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!active) onActivate();
      }}
      onKeyDown={(e) => {
        if (!active && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-left outline-none transition hover:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-ring ring-1 ring-ring",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {active ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <Input
            ref={inputRef}
            type="text"
            inputMode={inputMode}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 rounded-xl text-lg font-semibold tabular-nums"
            onBlur={() => void onSave()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Enter 保存 · Esc 取消</p>
        </div>
      ) : (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums">{display}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
        </>
      )}
    </div>
  );
}
