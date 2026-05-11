import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTodayPlan, type PlanShape } from "@/lib/plan.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Target, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SageChatPanel, type SageChatMessage } from "@/components/sage-chat-panel";
import { SAGE_DEEPSEEK_SYSTEM_PROMPT, TODAY_PAGE_CONTEXT_SUFFIX } from "@/lib/sage-system-prompt";
import { fetchDeepSeekReply } from "@/lib/deepseek";

export const Route = createFileRoute("/_authenticated/app/today")({ component: Today });

function Today() {
  const { user } = useAuth();
  const get = useServerFn(getTodayPlan);
  const qc = useQueryClient();
  const [profile, setProfile] = useState<{
    display_name?: string | null;
    current_score?: number | null;
    target_score?: number | null;
    exam_date?: string | null;
  } | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name,current_score,target_score,exam_date")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [user]);

  const { data, isLoading } = useQuery({ queryKey: ["today-plan"], queryFn: () => get() });

  const { data: coachRows = [] } = useQuery({
    queryKey: ["today-coach-chat", user?.id],
    enabled: !!user?.id && showChat,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("coach_messages")
        .select("id,role,content,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(120);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const coachMessages: SageChatMessage[] = useMemo(
    () =>
      (coachRows ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    [coachRows],
  );

  const plan: PlanShape | null = data?.plan ?? null;
  const days =
    profile?.exam_date !== null && profile?.exam_date !== undefined
      ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
      : null;
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

  const sendCoach = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.id || isSending) return;

    setIsSending(true);
    setDraft("");

    try {
      const sys =
        SAGE_DEEPSEEK_SYSTEM_PROMPT +
        TODAY_PAGE_CONTEXT_SUFFIX +
        `\n学生档案：目标分 ${profile?.target_score ?? "—"}，当前分 ${profile?.current_score ?? "—"}，距离考试 ${days === null ? "—" : `${days} 天`}。`;

      const { error: uErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
      });
      if (uErr) throw uErr;

      await qc.invalidateQueries({ queryKey: ["today-coach-chat", user.id] });

      const { data: history, error: hErr } = await supabase
        .from("coach_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(120);
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

      const { error: aErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: reply,
      });
      if (aErr) throw aErr;

      await qc.invalidateQueries({ queryKey: ["today-coach-chat", user.id] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }, [draft, user?.id, isSending, profile, days, qc]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">今天，从最重要的一件事开始。</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={Target}
          label="目标分"
          value={profile?.target_score ? `${profile.target_score}` : "—"}
        />
        <Stat
          icon={Sparkles}
          label="当前分"
          value={profile?.current_score ? `${profile.current_score}` : "—"}
        />
        <Stat icon={Clock} label="距考试" value={days !== null ? `${days} 天` : "—"} />
      </div>

      {plan ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">今日计划</h2>
          {isLoading ? (
            <p className="mt-6 text-sm text-muted-foreground">加载中…</p>
          ) : (
            <div className="mt-5 space-y-4">
              <p className="text-balance text-base font-medium">{plan.focus}</p>
              <ul className="space-y-2">
                {plan.tasks?.map((t, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                          {t.subject}
                        </span>
                        <span className="font-medium">{t.title}</span>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t.minutes} 分
                      </span>
                    </div>
                    {t.why && <p className="mt-1.5 text-sm text-muted-foreground">{t.why}</p>}
                  </motion.li>
                ))}
              </ul>
              {plan.warning && (
                <div className="flex items-start gap-2 rounded-2xl bg-warm p-4 text-sm text-warm-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {plan.warning}
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant={showChat ? "secondary" : "default"}
          onClick={() => setShowChat((v) => !v)}
          className="h-12 w-full rounded-2xl text-base sm:w-auto sm:min-w-[200px]"
        >
          {showChat ? "收起对话" : "让 AI 安排"}
        </Button>

        {showChat && (
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm text-muted-foreground">
              和 Sage 说说今天的状态，一起定今天最值得先做的一件事。
            </p>
            <SageChatPanel
              messages={coachMessages}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={() => void sendCoach()}
              isSending={isSending}
              emptyTitle="从这里开始"
              emptyHint="可以是一句拖延、一门最不想碰的科目，或一个具体目标。"
              placeholder="说说今天想怎么学…"
              className="min-h-[260px]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
