import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import { SAGE_DEEPSEEK_SYSTEM_PROMPT, reviewContextSuffix } from "@/lib/sage-system-prompt";
import { fetchDeepSeekReply } from "@/lib/deepseek";
import { SageChatPanel, type SageChatMessage } from "@/components/sage-chat-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/review")({ component: Review });

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(ymd: string) {
  const [y, mo, da] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "short" });
}

type SessionRow = { id: string; session_date: string };

function Review() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState<Subject>(SUBJECTS[0]);
  const [selectedDate, setSelectedDate] = useState(() => localYmd());
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setSelectedDate(localYmd());
  }, [subject]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["review-sessions", user?.id, subject],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_messages")
        .select("review_session_date")
        .eq("user_id", user!.id)
        .eq("review_subject", subject)
        .not("review_session_date", "is", null)
        .order("review_session_date", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      const list: SessionRow[] = [];
      for (const row of data ?? []) {
        const d = row.review_session_date;
        if (!d || seen.has(d)) continue;
        seen.add(d);
        list.push({ id: d, session_date: d });
      }
      return list;
    },
  });

  const hasSessionForSelectedDate = useMemo(
    () => sessions.some((s) => s.session_date === selectedDate),
    [sessions, selectedDate],
  );

  const { data: messageRows = [] } = useQuery({
    queryKey: ["review-messages", user?.id, subject, selectedDate],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_messages")
        .select("id,role,content,created_at")
        .eq("user_id", user!.id)
        .eq("review_subject", subject)
        .eq("review_session_date", selectedDate)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const messages: SageChatMessage[] = useMemo(
    () =>
      messageRows.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    [messageRows],
  );

  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) set.add(s.session_date);
    set.add(localYmd());
    set.add(selectedDate);
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [sessions, selectedDate]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.id || isSending) return;

    setIsSending(true);
    setDraft("");

    try {
      const { error: uErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
        review_subject: subject,
        review_session_date: selectedDate,
      });
      if (uErr) throw uErr;

      await qc.invalidateQueries({ queryKey: ["review-sessions", user.id, subject] });
      await qc.invalidateQueries({ queryKey: ["review-messages", user.id, subject, selectedDate] });

      const { data: history, error: hErr } = await supabase
        .from("coach_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .eq("review_subject", subject)
        .eq("review_session_date", selectedDate)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (hErr) throw hErr;

      const sys = SAGE_DEEPSEEK_SYSTEM_PROMPT + reviewContextSuffix(subject, selectedDate);
      const apiMessages = [
        { role: "system" as const, content: sys },
        ...(history ?? []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const reply = await fetchDeepSeekReply(apiMessages);

      const { error: aErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: reply,
        review_subject: subject,
        review_session_date: selectedDate,
      });
      if (aErr) throw aErr;

      await qc.invalidateQueries({ queryKey: ["review-sessions", user.id, subject] });
      await qc.invalidateQueries({ queryKey: ["review-messages", user.id, subject, selectedDate] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }, [draft, user?.id, isSending, subject, selectedDate, qc]);

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-5 pb-2 md:min-h-[calc(100dvh-7rem)]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选一科，和 Sage 聊聊今天哪里卡住——用问题把模糊变成具体。
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="lg:w-52 lg:shrink-0 lg:border-r lg:border-border lg:pr-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sessions
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto lg:max-h-[min(420px,50vh)]">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(s.session_date)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-2 text-left text-sm transition",
                    selectedDate === s.session_date
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="block text-foreground">{formatDateLabel(s.session_date)}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {s.session_date}
                  </span>
                </button>
              </li>
            ))}
            {sessions.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">
                暂无记录，从下面「今天」开始。
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setSelectedDate(localYmd())}
            className={cn(
              "mt-2 w-full rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-sm transition hover:bg-muted",
              selectedDate === localYmd() && "border-primary/40 bg-primary/5",
            )}
          >
            + 今天 · {localYmd()}
          </button>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">科目</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={cn(
                    "rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                    subject === s
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-ring/50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="md:hidden">
            <p className="mb-2 text-xs font-medium text-muted-foreground">复盘日期</p>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="rounded-xl border-border bg-card">
                <SelectValue placeholder="选择日期" />
              </SelectTrigger>
              <SelectContent>
                {dateOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {formatDateLabel(d)} · {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!hasSessionForSelectedDate && messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              这是新会话；发第一条消息后，该日期会出现在左侧列表。
            </p>
          )}

          <SageChatPanel
            messages={messages}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={() => void send()}
            isSending={isSending}
            emptyTitle="从这里开始复盘"
            emptyHint="说说今天这科哪里最耗你、最不想碰，或最懵的一道题。"
            placeholder={`聊聊今天的「${subject}」…`}
            className="min-h-[320px] md:min-h-[420px]"
          />
        </div>
      </div>
    </div>
  );
}
