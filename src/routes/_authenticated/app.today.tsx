import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sparkles, Clock, Target } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { subjectAccentCardClass, subjectBadgeClass } from "@/lib/subject-accent";
import { fetchWeakArchive, formatArchiveDateLabel, persistTaskCompletion, type WeakArchiveRow } from "@/lib/weak-archive";

export const Route = createFileRoute("/_authenticated/app/today")({ component: Today });

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchTodayDailyProgress(userId: string): Promise<{ subjectCount: number; clearedCount: number }> {
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
}

async function fetchPendingSageHook(userId: string): Promise<string | null> {
  const todayYmd = localYmd();
  const { data, error } = await supabase
    .from("review_summaries")
    .select("follow_up,created_at,session_date")
    .eq("user_id", userId)
    .not("follow_up", "is", null)
    .lt("session_date", todayYmd)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  const row = (data ?? []).find((r) => String(r.follow_up ?? "").trim() !== "");
  return row?.follow_up?.trim() ?? null;
}

type ProfileRow = {
  display_name?: string | null;
  current_score?: number | null;
  target_score?: number | null;
};

type EditingField = "target" | "current" | null;

/** Days from local today to next June 7 (this year, or next if June 7 already passed). */
function daysUntilGaokaoJune7(): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = now.getFullYear();
  let target = new Date(y, 5, 7);
  if (today.getTime() > target.getTime()) {
    target = new Date(y + 1, 5, 7);
  }
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

type TodayTaskRow = {
  id: string;
  subject: string;
  tonight_task: string;
  completed: boolean;
};

async function fetchTodayTasks(userId: string): Promise<TodayTaskRow[]> {
  const { data: summaries, error: sErr } = await supabase
    .from("review_summaries")
    .select("id,subject,tonight_task,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (sErr) throw sErr;
  const trimmed = (summaries ?? []).filter((r) => String(r.tonight_task ?? "").trim() !== "");
  const top3 = trimmed.slice(0, 3);
  if (top3.length === 0) return [];
  const ids = top3.map((r) => r.id);
  const { data: comps, error: cErr } = await supabase
    .from("task_completions")
    .select("review_summary_id,completed")
    .eq("user_id", userId)
    .in("review_summary_id", ids);
  if (cErr) throw cErr;
  const map = new Map((comps ?? []).map((c) => [c.review_summary_id, c.completed]));
  return top3.map((r) => ({
    id: r.id,
    subject: r.subject,
    tonight_task: String(r.tonight_task).trim(),
    completed: map.get(r.id) ?? false,
  }));
}

function Today() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState<EditingField>(null);
  const [editDraft, setEditDraft] = useState("");
  const skipBlurSave = useRef(false);
  const [archiveCelebrateId, setArchiveCelebrateId] = useState<string | null>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gaokaoDays = daysUntilGaokaoJune7();
  const gaokaoUrgent = gaokaoDays >= 0 && gaokaoDays < 7;

  const { data: summaryCount, isSuccess: summaryCountReady, isError: summaryCountError } = useQuery({
    queryKey: ["review-summary-meta", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("review_summaries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!summaryCountReady || summaryCountError) return;
    if (summaryCount > 0) return;
    nav({ to: "/app/review", replace: true });
  }, [summaryCountReady, summaryCountError, summaryCount, nav]);

  useEffect(() => {
    const onRefresh = () => {
      if (!user?.id) return;
      void qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
      void qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
      void qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] });
      void qc.invalidateQueries({ queryKey: ["today-sage-hook", user.id] });
    };
    window.addEventListener("sage-weak-archive-refresh", onRefresh);
    return () => window.removeEventListener("sage-weak-archive-refresh", onRefresh);
  }, [user?.id, qc]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name,current_score,target_score")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile(data);
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const {
    data: tasks = [],
    isLoading: tasksLoading,
    isError: tasksError,
  } = useQuery({
    queryKey: ["today-tasks", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchTodayTasks(user!.id),
  });

  const {
    data: archiveRows = [],
    isLoading: archiveLoading,
    isError: archiveError,
  } = useQuery({
    queryKey: ["weak-point-archive", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchWeakArchive(user!.id),
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
    queryFn: () => fetchTodayDailyProgress(user!.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const { data: pendingFollowUp, isLoading: hookLoading } = useQuery({
    queryKey: ["today-sage-hook", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchPendingSageHook(user!.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

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

  if (summaryCountReady && !summaryCountError && summaryCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <p>正在带你去复盘页…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="shrink-0">
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">今天，从最重要的一件事开始。</h1>
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
        <GaokaoCountdownCard days={gaokaoDays} urgent={gaokaoUrgent} />
      </div>

      <section
        className="shrink-0 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-foreground shadow-sm"
        aria-label="今日进度"
      >
        {dailyProgressError ? (
          <span className="text-destructive">今日进度加载失败</span>
        ) : dailyProgressLoading || !dailyProgress ? (
          <span className="text-muted-foreground">今日进度加载中…</span>
        ) : (
          <span className="font-medium tabular-nums">
            今日复盘 {dailyProgress.subjectCount} 科 · 卡点攻克 {dailyProgress.clearedCount} 个
          </span>
        )}
      </section>

      {!hookLoading && pendingFollowUp ? (
        <section className="shrink-0 rounded-3xl border border-primary/20 bg-primary/[0.06] p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-primary/80">Sage 在等你</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Sage 在等你汇报：{pendingFollowUp}
          </p>
          <Button asChild className="mt-4 rounded-xl" size="sm" variant="secondary">
            <Link to="/app/review">去复盘 →</Link>
          </Button>
        </section>
      ) : null}

      <section className="shrink-0 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold tracking-tight">今日任务</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">来自最近一次复盘的「今晚任务」，最多显示 3 条。</p>

        {tasksError ? (
          <p className="mt-4 text-sm text-destructive">
            任务加载失败。若刚部署数据库，请先执行迁移（含 task_completions 表）。
          </p>
        ) : tasksLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">加载任务…</p>
        ) : tasks.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center">
            <p className="text-sm text-foreground">
              还没有今日任务。去复盘一科，Sage 会告诉你今晚该做什么。
            </p>
            <Button asChild className="mt-4 rounded-xl" size="sm">
              <Link to="/app/review">开始复盘 →</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex gap-3 rounded-2xl border border-border bg-card/60 px-3 py-3 shadow-sm"
              >
                <Checkbox
                  id={`task-${t.id}`}
                  checked={t.completed}
                  onCheckedChange={(v) => void toggleTaskComplete(t.id, v === true)}
                  className="mt-1 shrink-0"
                  aria-label="标记完成"
                />
                <label htmlFor={`task-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={subjectBadgeClass(t.subject)}>{t.subject}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-sm leading-relaxed text-foreground",
                      t.completed && "text-muted-foreground line-through",
                    )}
                  >
                    {t.tonight_task}
                  </p>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="shrink-0 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold tracking-tight">我的卡点档案</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">按时间整理的复盘小结，勾选表示这个卡点已搞定。</p>

        {archiveError ? (
          <p className="mt-4 text-sm text-destructive">卡点档案加载失败。</p>
        ) : archiveLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">加载档案…</p>
        ) : archiveRows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            还没有卡点记录。完成第一次复盘后，你的档案会出现在这里。
          </p>
        ) : (
          <ul className="relative mt-4 space-y-4 border-l border-border pl-4">
            {archiveRows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/50" />
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl border border-border py-3 pl-4 pr-3 shadow-sm",
                    subjectAccentCardClass(r.subject),
                  )}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <Checkbox
                      id={`arch-${r.id}`}
                      checked={r.completed}
                      onCheckedChange={(v) => onArchiveCheck(r.id, v === true)}
                      className="mt-0.5 shrink-0"
                      aria-label="标记卡点已解决"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <time className="tabular-nums" dateTime={r.session_date}>
                          {formatArchiveDateLabel(r.session_date, r.created_at)}
                        </time>
                        <span className={subjectBadgeClass(r.subject)}>{r.subject}</span>
                      </div>
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GaokaoCountdownCard({ days, urgent }: { days: number; urgent: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-left outline-none transition",
        urgent && "border-amber-500/55 bg-amber-500/[0.08] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        倒计时
      </div>
      <div className="mt-1 text-lg font-semibold leading-snug tabular-nums">
        距高考 {days} 天
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">每年 6 月 7 日 · 自动计算</p>
    </div>
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
