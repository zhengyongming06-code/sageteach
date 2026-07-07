import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  diagnosticBannerDismissStorageKey,
  diagnosticEligibilityQueryKey,
  fetchDiagnosticBannerEligible,
} from "@/lib/diagnostic-eligibility";
import { safeSessionGet, safeSessionSet } from "@/lib/safe-storage";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  subjectAccentTaskClass,
} from "@/lib/subject-accent";
import { KnowledgeTodayPanel } from "@/components/knowledge-today-panel";
import { TodayPageRail, type TodayTocSection } from "@/components/today-page-rail";
import { SAGE_KNOWLEDGE_REFRESH_EVENT } from "@/lib/knowledge-tracking/ingest-client";
import {
  fetchWeakArchive,
  formatArchiveDateLabel,
  persistTaskCompletion,
  weakArchiveQueryKey,
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

type ProfileRow = {
  display_name?: string | null;
  current_score?: number | null;
  target_score?: number | null;
};

type EditingField = "target" | "current" | null;

const SPRINT_EXAM_MAX_DAYS = 30;

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
  const [knowledgeToc, setKnowledgeToc] = useState<TodayTocSection[]>([]);

  const tocSections = useMemo<TodayTocSection[]>(
    () => [
      { id: "overview", label: "概览" },
      ...knowledgeToc,
      { id: "archive", label: "今晚任务" },
    ],
    [knowledgeToc],
  );

  useEffect(() => {
    if (!user?.id) {
      setDiagnosticBannerDismissed(false);
      return;
    }
    setDiagnosticBannerDismissed(
      safeSessionGet(diagnosticBannerDismissStorageKey(user.id)) === "1",
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
      void qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] });
      void qc.invalidateQueries({ queryKey: ["user-exams", user.id] });
      void qc.invalidateQueries({ queryKey: diagnosticEligibilityQueryKey(user.id) });
      void qc.invalidateQueries({ queryKey: ["knowledge-points", user.id] });
      window.dispatchEvent(new CustomEvent(SAGE_KNOWLEDGE_REFRESH_EVENT));
    };
    window.addEventListener("sage-weak-archive-refresh", onRefresh);
    window.addEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener("sage-weak-archive-refresh", onRefresh);
      window.removeEventListener(SAGE_KNOWLEDGE_REFRESH_EVENT, onRefresh);
    };
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
    data: archiveRows = [],
    isLoading: archiveLoading,
    isError: archiveError,
  } = useQuery({
    queryKey: weakArchiveQueryKey(user?.id ?? "__none__"),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
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

  const progressLine = useMemo(() => {
    if (dailyProgressError) return "今日进度加载失败";
    if (dailyProgress == null) {
      if (loadDeadlinePassed && dailyProgressLoading) return "今日进度加载较慢";
      if (dailyProgressLoading) return "加载进度…";
      return "今日复盘 0 科 · 卡点攻克 0 个";
    }
    return `今日复盘 ${dailyProgress.subjectCount} 科 · 卡点攻克 ${dailyProgress.clearedCount} 个`;
  }, [dailyProgress, dailyProgressError, dailyProgressLoading, loadDeadlinePassed]);

  const examMetaLine = useMemo(() => {
    if (examCountdownDays === null) return "添加考试日程";
    if (examCountdownDays < 0) return `${examCountdownName} 已过 ${-examCountdownDays} 天`;
    return `距${examCountdownName} ${examCountdownDays} 天`;
  }, [examCountdownDays, examCountdownName]);

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
    safeSessionSet(diagnosticBannerDismissStorageKey(user.id), "1");
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
        await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
        return;
      }
      await qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
      await qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] });
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

  return (
    <div className="wiki-page-grid">
      <article className="wiki-prose wiki-prose-sheet">
        <nav className="wiki-breadcrumb" aria-label="面包屑">
          <Link to="/app/today">Home</Link>
          <span className="wiki-breadcrumb-sep">›</span>
          <Link to="/app/today">Today</Link>
          <span className="wiki-breadcrumb-sep">›</span>
          <span className="text-[var(--wiki-nav-fg)]">Overview</span>
        </nav>

        <header id="overview" className="wiki-prose-section !mt-0">
          <h1 className="wiki-page-title">
            {examSprint ? `还有 ${examCountdownDays} 天` : "Today"}
          </h1>
          <div className="wiki-meta-row">
            <span>{greet}</span>
            <span className="wiki-meta-sep">·</span>
            <MetaScore
              label="目标分"
              value={profile?.target_score}
              active={editing === "target"}
              draft={editDraft}
              onDraftChange={setEditDraft}
              onActivate={() => beginEdit("target")}
              onSave={() => void saveField("target")}
              onCancel={cancelEdit}
            />
            <span className="wiki-meta-sep">·</span>
            <MetaScore
              label="当前分"
              value={profile?.current_score}
              active={editing === "current"}
              draft={editDraft}
              onDraftChange={setEditDraft}
              onActivate={() => beginEdit("current")}
              onSave={() => void saveField("current")}
              onCancel={cancelEdit}
            />
            <span className="wiki-meta-sep">·</span>
            <button
              type="button"
              className={cn("wiki-meta-btn", examUrgent && "text-foreground font-medium")}
              onClick={() => setExamScheduleOpen(true)}
            >
              {examMetaLine}
            </button>
          </div>
          {examSprint || profile?.target_score != null ? (
            <div className="wiki-tags">
              {examSprint ? <span className="wiki-tag">冲刺模式</span> : null}
              {profile?.target_score != null ? (
                <span className="wiki-tag">目标 {profile.target_score}</span>
              ) : null}
            </div>
          ) : null}
          {!examSprint ? (
            <p className="mt-4 text-base leading-relaxed text-[var(--wiki-fg)]">
              今天，从最重要的一件事开始。
            </p>
          ) : (
            <p className="mt-4 text-base leading-relaxed text-[var(--wiki-fg)]">
              冲刺阶段——今天只做一件事。
            </p>
          )}
        </header>

        {showDiagnosticBanner ? (
          <section className="wiki-prose-section">
            <div className="wiki-callout relative" aria-label="知识点诊断">
              <button
                type="button"
                onClick={dismissDiagnosticBanner}
                className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-[var(--wiki-hover)] hover:text-foreground"
                aria-label="关闭提示"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="pr-8 text-sm leading-relaxed">
                做个知识点诊断，Sage 按全科考点帮你找出最需要补的部分
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link to="/app/diagnostic" className="wiki-link-text text-sm">
                  开始诊断 →
                </Link>
                <button
                  type="button"
                  className="wiki-meta-btn text-sm"
                  onClick={dismissDiagnosticBanner}
                >
                  稍后再说
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {user?.id ? (
          <KnowledgeTodayPanel userId={user.id} onTocChange={setKnowledgeToc} />
        ) : null}

        <section id="archive" className="wiki-prose-section">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="wiki-prose-h2">今晚任务</h2>
            <Link to="/app/review" className="wiki-link-text shrink-0">
              去复盘 →
            </Link>
          </div>
          <p className="wiki-prose-lead">
            每次复盘整理出的任务会留在这里。做完就点「标记完成」。
          </p>

          {archiveError ? (
            <p className="text-sm text-destructive">今晚任务加载失败。</p>
          ) : archiveLoading && !loadDeadlinePassed ? (
            <p className="wiki-prose-sub">加载中…</p>
          ) : archiveLoading && loadDeadlinePassed ? (
            <p className="wiki-prose-sub">加载较慢，请稍后再试或刷新页面。</p>
          ) : archiveRows.length === 0 ? (
            <p className="wiki-prose-sub">
              还没有任务。完成第一次复盘并整理今晚任务后，会出现在这里。
            </p>
          ) : (
            <ul className="wiki-prose-list">
              {archiveRows.map((r) => (
                <li key={r.id} className={cn(subjectAccentTaskClass(r.subject))}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <time className="wiki-prose-sub text-xs tabular-nums" dateTime={r.session_date}>
                          {formatArchiveDateLabel(r.session_date, r.created_at)}
                        </time>
                        <span className="wiki-tag">{r.subject}</span>
                      </div>
                      <p
                        className={cn(
                          "mt-1.5 text-sm font-medium leading-snug text-[var(--wiki-fg)]",
                          r.completed && "text-[var(--wiki-muted)] line-through",
                        )}
                      >
                        {r.tonight_task}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-xs text-[var(--wiki-nav-fg)]",
                          r.completed && "line-through opacity-80",
                        )}
                      >
                        卡在 {r.weak_point}
                      </p>
                      {archiveCelebrateId === r.id ? (
                        <p className="mt-2 text-sm text-[var(--wiki-nav-fg)]">✓ 搞定了这个卡点</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="wiki-inline-action"
                      onClick={() => onArchiveCheck(r.id, !r.completed)}
                    >
                      {r.completed ? "取消完成" : "标记完成"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>

      <TodayPageRail
        userId={user?.id}
        sections={tocSections}
        progressLine={progressLine}
        progressLoading={dailyProgressLoading && dailyProgress == null}
      />

      {user?.id ? (
        <ExamScheduleDialog open={examScheduleOpen} onOpenChange={setExamScheduleOpen} userId={user.id} />
      ) : null}
    </div>
  );
}

function MetaScore({
  label,
  value,
  active,
  draft,
  onDraftChange,
  onActivate,
  onSave,
  onCancel,
}: {
  label: string;
  value: number | null | undefined;
  active: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onActivate: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) {
      queueMicrotask(() => inputRef.current?.focus());
      inputRef.current?.select();
    }
  }, [active]);

  if (active) {
    return (
      <span className="inline-flex items-center gap-1">
        {label}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          className="wiki-meta-input"
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
      </span>
    );
  }

  return (
    <button type="button" className="wiki-meta-btn" onClick={onActivate}>
      {label} {value != null ? value : "—"}
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
