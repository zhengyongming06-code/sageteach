import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sparkles, Clock, Target } from "lucide-react";
import { toast } from "sonner";
import { SageChatPanel, type SageChatMessage } from "@/components/sage-chat-panel";
import { Input } from "@/components/ui/input";
import {
  SAGE_DEEPSEEK_SYSTEM_PROMPT,
  TODAY_INLINE_OPENING,
  TODAY_PAGE_CONTEXT_SUFFIX,
} from "@/lib/sage-system-prompt";
import { fetchDeepSeekReply } from "@/lib/deepseek";
import { coachMessagesHasReviewColumns } from "@/lib/coach-messages-schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/today")({ component: Today });

type ProfileRow = {
  display_name?: string | null;
  current_score?: number | null;
  target_score?: number | null;
  exam_date?: string | null;
};

type EditingField = "target" | "current" | "exam" | null;

function daysUntilExam(examDate: string | null | undefined): number | null {
  if (examDate == null || examDate === "") return null;
  const t = new Date(examDate + "T12:00:00");
  if (Number.isNaN(t.getTime())) return null;
  return Math.max(0, Math.ceil((t.getTime() - Date.now()) / 86400000));
}

function addDaysToTodayIso(days: number): string {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + Math.max(0, Math.floor(days)));
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function Today() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState<EditingField>(null);
  const [editDraft, setEditDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const openingSeedStarted = useRef(false);
  const skipBlurSave = useRef(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name,current_score,target_score,exam_date")
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

  const { data: coachRows = [], isSuccess } = useQuery({
    queryKey: ["today-coach-chat", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const extended = await coachMessagesHasReviewColumns(supabase);
      if (!extended) {
        const { data: rows, error } = await supabase
          .from("coach_messages")
          .select("id,role,content,created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: true })
          .limit(120);
        if (error) throw error;
        return rows ?? [];
      }
      const { data: rows, error } = await supabase
        .from("coach_messages")
        .select("id,role,content,created_at,review_subject,review_session_date")
        .eq("user_id", user!.id)
        .is("review_subject", null)
        .is("review_session_date", null)
        .order("created_at", { ascending: true })
        .limit(120);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const coachMessages: SageChatMessage[] = (coachRows ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  useEffect(() => {
    if (!user?.id || !isSuccess) return;
    if (coachRows.length > 0) return;
    if (typeof window === "undefined") return;
    const key = `sage-today-opening-${user.id}`;
    if (sessionStorage.getItem(key)) return;
    if (openingSeedStarted.current) return;
    openingSeedStarted.current = true;
    let cancelled = false;
    void (async () => {
      const extended = await coachMessagesHasReviewColumns(supabase);
      const { error } = await supabase.from("coach_messages").insert(
        extended
          ? {
              user_id: user.id,
              role: "assistant",
              content: TODAY_INLINE_OPENING,
              review_subject: null,
              review_session_date: null,
            }
          : {
              user_id: user.id,
              role: "assistant",
              content: TODAY_INLINE_OPENING,
            },
      );
      if (cancelled || error) {
        openingSeedStarted.current = false;
        if (error) toast.error(error.message);
        return;
      }
      sessionStorage.setItem(key, "1");
      openingSeedStarted.current = false;
      await qc.invalidateQueries({ queryKey: ["today-coach-chat", user.id] });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isSuccess, coachRows.length, qc]);

  const days = daysUntilExam(profile?.exam_date);

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
    } else if (field === "current") {
      setEditDraft(profile?.current_score != null ? String(profile.current_score) : "");
    } else {
      setEditDraft(days != null ? String(days) : "");
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
          const n = v === "" ? null : parseInt(v, 10);
          if (v !== "" && (Number.isNaN(n) || n < 0 || n > 900)) {
            toast.error("请输入 0–900 之间的目标分，或留空");
            return;
          }
          const { error } = await supabase
            .from("profiles")
            .update({ target_score: n })
            .eq("id", user.id);
          if (error) throw error;
          setProfile((p) => (p ? { ...p, target_score: n } : p));
        } else if (field === "current") {
          const v = editDraft.trim();
          const n = v === "" ? null : parseInt(v, 10);
          if (v !== "" && (Number.isNaN(n) || n < 0 || n > 900)) {
            toast.error("请输入 0–900 之间的分数，或留空");
            return;
          }
          const { error } = await supabase
            .from("profiles")
            .update({ current_score: n })
            .eq("id", user.id);
          if (error) throw error;
          setProfile((p) => (p ? { ...p, current_score: n } : p));
        } else {
          const v = editDraft.trim();
          let exam_date: string | null;
          if (v === "") {
            exam_date = null;
          } else {
            const n = parseInt(v, 10);
            if (Number.isNaN(n) || n < 0 || n > 2000) {
              toast.error("请输入距考试的天数（0 以上），或留空清除");
              return;
            }
            exam_date = addDaysToTodayIso(n);
          }
          const { error } = await supabase.from("profiles").update({ exam_date }).eq("id", user.id);
          if (error) throw error;
          setProfile((p) => (p ? { ...p, exam_date } : p));
        }
        setEditing(null);
        setEditDraft("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    },
    [user?.id, editing, editDraft],
  );

  const sendCoach = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.id || isSending) return;

    setIsSending(true);
    setDraft("");

    const d = daysUntilExam(profile?.exam_date);

    try {
      const extended = await coachMessagesHasReviewColumns(supabase);
      const sys =
        SAGE_DEEPSEEK_SYSTEM_PROMPT +
        TODAY_PAGE_CONTEXT_SUFFIX +
        `\n学生档案：目标分 ${profile?.target_score ?? "—"}，当前分 ${profile?.current_score ?? "—"}，距离考试 ${d === null ? "—" : `${d} 天`}。`;

      const { error: uErr } = await supabase.from("coach_messages").insert(
        extended
          ? {
              user_id: user.id,
              role: "user",
              content: text,
              review_subject: null,
              review_session_date: null,
            }
          : { user_id: user.id, role: "user", content: text },
      );
      if (uErr) throw uErr;

      await qc.invalidateQueries({ queryKey: ["today-coach-chat", user.id] });

      let historyQuery = supabase
        .from("coach_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(120);
      if (extended) {
        historyQuery = historyQuery.is("review_subject", null).is("review_session_date", null);
      }
      const { data: history, error: hErr } = await historyQuery;
      if (hErr) throw hErr;

      const thread = (history ?? []).filter((m) => m.role === "user" || m.role === "assistant");
      const apiMessages = [
        { role: "system" as const, content: sys },
        ...thread.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const reply = await fetchDeepSeekReply(apiMessages);

      const { error: aErr } = await supabase.from("coach_messages").insert(
        extended
          ? {
              user_id: user.id,
              role: "assistant",
              content: reply,
              review_subject: null,
              review_session_date: null,
            }
          : { user_id: user.id, role: "assistant", content: reply },
      );
      if (aErr) throw aErr;

      await qc.invalidateQueries({ queryKey: ["today-coach-chat", user.id] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }, [draft, user?.id, isSending, profile, qc]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
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
        <StatCard
          icon={Clock}
          label="距考试"
          display={days != null ? `${days} 天` : "—"}
          hint="点击编辑天数"
          active={editing === "exam"}
          draft={editDraft}
          onDraftChange={setEditDraft}
          onActivate={() => beginEdit("exam")}
          onSave={() => void saveField("exam")}
          onCancel={cancelEdit}
          inputMode="numeric"
          placeholder="天数"
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-card p-4 shadow-sm">
        <SageChatPanel
          messages={coachMessages}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={() => void sendCoach()}
          isSending={isSending}
          emptyTitle="加载对话…"
          emptyHint=""
          placeholder="和 Sage 聊聊今天…"
          expand
          className="min-h-0"
        />
      </section>
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
