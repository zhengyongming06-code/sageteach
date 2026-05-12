import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import {
  REVIEW_PRACTICE_PROBLEM_SUFFIX,
  SAGE_DEEPSEEK_SYSTEM_PROMPT,
  SAGE_DUAL_MODE_SUFFIX,
  SAGE_RESOURCE_RECOMMENDATIONS_SUFFIX,
  reviewContextSuffix,
} from "@/lib/sage-system-prompt";
import { fetchDeepSeekReply } from "@/lib/deepseek";
import { SageChatPanel, type SageChatMessage } from "@/components/sage-chat-panel";
import { ReviewSummaryCard } from "@/components/review-summary-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { coachMessagesHasReviewColumns, MIGRATION_HINT } from "@/lib/coach-messages-schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  POST_REVIEW_SESSION_CLOSING,
  REVIEW_ONBOARDING_FIRST_OPENING,
  REVIEW_RETURNING_FIRST_OPENING,
} from "@/lib/review-opening";
import { assistantSignalsCorrectness } from "@/lib/review-positive-feedback";
import {
  formatReviewConversationForSummary,
  requestReviewSummaryStructured,
  userEndsReviewSession,
} from "@/lib/review-summary";

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

type SessionRow = { session_date: string; subject: string };
type SidebarSessionFilter = "全部" | Subject;

type SessionCardState =
  | null
  | {
      kind: "full";
      subject: string;
      weak_point: string;
      tonight_task: string;
      follow_up: string;
      mastered: string | null;
    }
  | { kind: "fallback" };

function sessionKey(subject: string, date: string) {
  return `${subject}::${date}`;
}

function Review() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState<Subject>(SUBJECTS[0]);
  const [selectedDate, setSelectedDate] = useState(() => localYmd());
  const [sidebarSessionFilter, setSidebarSessionFilter] = useState<SidebarSessionFilter>("全部");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sessionCard, setSessionCard] = useState<SessionCardState>(null);
  const summaryDoneKeysRef = useRef(new Set<string>());
  const openingFlightRef = useRef(false);
  const subjectRef = useRef(subject);
  const selectedDateRef = useRef(selectedDate);
  subjectRef.current = subject;
  selectedDateRef.current = selectedDate;

  useEffect(() => {
    setSelectedDate(localYmd());
  }, [subject]);

  useEffect(() => {
    setSessionCard(null);
  }, [subject, selectedDate]);

  const { data: hasReviewCols } = useQuery({
    queryKey: ["coach-review-schema"],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () => coachMessagesHasReviewColumns(supabase),
  });

  const {
    data: profileFlags,
    isSuccess: profileFlagsReady,
    isError: profileFlagsIsError,
  } = useQuery({
    queryKey: ["profile-flags", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("review_onboarding_complete")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { review_onboarding_complete: boolean } | null;
    },
  });

  const profileGateReady = profileFlagsReady || profileFlagsIsError;

  const { data: hasAnyReviewMessages } = useQuery({
    queryKey: ["review-prior-any", user?.id],
    enabled: !!user?.id && hasReviewCols === true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("coach_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .not("review_subject", "is", null);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  useEffect(() => {
    if (!user?.id || hasReviewCols !== true || hasAnyReviewMessages !== false || !profileGateReady)
      return;
    if (openingFlightRef.current) return;
    openingFlightRef.current = true;
    let cancelled = false;
    const uid = user.id;

    void (async () => {
      const { count, error: cErr } = await supabase
        .from("coach_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .not("review_subject", "is", null);
      if (cancelled || cErr) {
        openingFlightRef.current = false;
        return;
      }
      if ((count ?? 0) > 0) {
        openingFlightRef.current = false;
        await qc.invalidateQueries({ queryKey: ["review-prior-any", uid] });
        return;
      }

      const sub = subjectRef.current;
      const dt = selectedDateRef.current;
      const opening =
        profileFlags?.review_onboarding_complete === true
          ? REVIEW_RETURNING_FIRST_OPENING
          : REVIEW_ONBOARDING_FIRST_OPENING;
      const { error } = await supabase.from("coach_messages").insert({
        user_id: uid,
        role: "assistant",
        content: opening,
        review_subject: sub,
        review_session_date: dt,
      });
      openingFlightRef.current = false;
      if (cancelled || error) {
        if (error) console.error(error);
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-prior-any", uid] }),
        qc.invalidateQueries({ queryKey: ["review-sessions-index", uid] }),
        qc.invalidateQueries({ queryKey: ["review-messages", uid, sub, dt] }),
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, hasReviewCols, hasAnyReviewMessages, profileGateReady, profileFlags?.review_onboarding_complete, qc]);

  const { data: sessionIndex = [] } = useQuery({
    queryKey: ["review-sessions-index", user?.id],
    enabled: !!user?.id && hasReviewCols === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_messages")
        .select("review_session_date,review_subject")
        .eq("user_id", user!.id)
        .not("review_session_date", "is", null)
        .not("review_subject", "is", null)
        .order("review_session_date", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      const list: SessionRow[] = [];
      for (const row of data ?? []) {
        const d = row.review_session_date;
        const subj = row.review_subject;
        if (!d || !subj) continue;
        const k = `${d}::${subj}`;
        if (seen.has(k)) continue;
        seen.add(k);
        list.push({ session_date: d, subject: subj });
      }
      return list;
    },
  });

  const filteredSessionRows = useMemo(() => {
    if (sidebarSessionFilter === "全部") return sessionIndex;
    return sessionIndex.filter((s) => s.subject === sidebarSessionFilter);
  }, [sessionIndex, sidebarSessionFilter]);

  const hasSessionForSelectedDate = useMemo(
    () => sessionIndex.some((s) => s.session_date === selectedDate && s.subject === subject),
    [sessionIndex, selectedDate, subject],
  );

  const { data: messageRows = [] } = useQuery({
    queryKey: ["review-messages", user?.id, subject, selectedDate],
    enabled: !!user?.id && hasReviewCols === true,
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

  const userMessageCount = useMemo(
    () => messageRows.filter((m) => m.role === "user").length,
    [messageRows],
  );

  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessionIndex) set.add(s.session_date);
    set.add(localYmd());
    set.add(selectedDate);
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [sessionIndex, selectedDate]);

  const runSilentSummary = useCallback(
    async (historyRows: { role: string; content: string }[]) => {
      if (!user?.id) return;
      const key = sessionKey(subject, selectedDate);
      if (summaryDoneKeysRef.current.has(key)) return;

      const transcript = formatReviewConversationForSummary(historyRows);
      if (!transcript.trim()) return;

      summaryDoneKeysRef.current.add(key);

      try {
        const parsed = await requestReviewSummaryStructured(transcript);
        if (!parsed) throw new Error("parse");
        const subjectLabel = parsed.subject.trim() || subject;
        const row = {
          user_id: user.id,
          session_date: selectedDate,
          subject: subjectLabel,
          weak_point: parsed.weak_point,
          tonight_task: parsed.tonight_task,
          follow_up: parsed.follow_up,
          mastered: parsed.mastered,
        };
        const { error: insertErr } = await supabase.from("review_summaries").insert(row);
        if (insertErr) throw insertErr;

        setSessionCard({
          kind: "full",
          subject: subjectLabel,
          weak_point: parsed.weak_point,
          tonight_task: parsed.tonight_task,
          follow_up: parsed.follow_up,
          mastered: parsed.mastered,
        });

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ review_onboarding_complete: true })
          .eq("id", user.id);
        if (profileErr) console.error(profileErr);

        const { error: closingErr } = await supabase.from("coach_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: POST_REVIEW_SESSION_CLOSING,
          review_subject: subject,
          review_session_date: selectedDate,
        });
        if (closingErr) console.error(closingErr);

        await Promise.all([
          qc.invalidateQueries({ queryKey: ["review-summaries", user.id] }),
          qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] }),
          qc.invalidateQueries({ queryKey: ["today-tasks", user.id] }),
          qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] }),
          qc.invalidateQueries({ queryKey: ["today-sage-hook", user.id] }),
          qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] }),
          qc.invalidateQueries({ queryKey: ["review-messages", user.id, subject, selectedDate] }),
          qc.invalidateQueries({ queryKey: ["profile-flags", user.id] }),
          qc.invalidateQueries({ queryKey: ["review-summary-meta", user.id] }),
        ]);
        window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));
      } catch {
        summaryDoneKeysRef.current.delete(key);
        setSessionCard({ kind: "fallback" });
      }
    },
    [subject, selectedDate, user, qc],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.id || isSending) return;

    setIsSending(true);
    setDraft("");

    try {
      const extended = await coachMessagesHasReviewColumns(supabase);
      if (!extended) {
        toast.error(MIGRATION_HINT);
        return;
      }
      const keywordEnd = userEndsReviewSession(text);

      const { error: uErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
        review_subject: subject,
        review_session_date: selectedDate,
      });
      if (uErr) throw uErr;

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({ queryKey: ["review-messages", user.id, subject, selectedDate] });

      const { data: historyAfterUser, error: h0Err } = await supabase
        .from("coach_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .eq("review_subject", subject)
        .eq("review_session_date", selectedDate)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (h0Err) throw h0Err;

      const userCountAfter = (historyAfterUser ?? []).filter((m) => m.role === "user").length;
      const shouldSummarizeAfterTurn = keywordEnd || userCountAfter >= 8;

      const sys =
        SAGE_DEEPSEEK_SYSTEM_PROMPT +
        SAGE_DUAL_MODE_SUFFIX +
        REVIEW_PRACTICE_PROBLEM_SUFFIX +
        SAGE_RESOURCE_RECOMMENDATIONS_SUFFIX +
        reviewContextSuffix(subject, selectedDate);
      const apiMessages = [
        { role: "system" as const, content: sys },
        ...(historyAfterUser ?? []).map((m) => ({
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

      if (assistantSignalsCorrectness(reply)) {
        window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));
        void qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
        void qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
      }

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({ queryKey: ["review-messages", user.id, subject, selectedDate] });

      const { data: fullHistory, error: h1Err } = await supabase
        .from("coach_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .eq("review_subject", subject)
        .eq("review_session_date", selectedDate)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (h1Err) throw h1Err;

      if (shouldSummarizeAfterTurn) {
        await runSilentSummary(fullHistory ?? []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }, [draft, user?.id, isSending, subject, selectedDate, qc, runSilentSummary]);

  const onEndReviewClick = useCallback(() => {
    if (userMessageCount < 3) return;
    void runSilentSummary(messageRows.map((m) => ({ role: m.role, content: m.content })));
  }, [userMessageCount, messageRows, runSilentSummary]);

  const summaryBelow = sessionCard ? (
    <ReviewSummaryCard
      variant={sessionCard.kind === "fallback" ? "fallback" : "full"}
      subject={sessionCard.kind === "full" ? sessionCard.subject : undefined}
      weakPoint={sessionCard.kind === "full" ? sessionCard.weak_point : undefined}
      tonightTask={sessionCard.kind === "full" ? sessionCard.tonight_task : undefined}
      followUp={sessionCard.kind === "full" ? sessionCard.follow_up : undefined}
      mastered={sessionCard.kind === "full" ? sessionCard.mastered : undefined}
    />
  ) : null;

  const showOnboardingBanner = profileFlagsReady && profileFlags?.review_onboarding_complete !== true;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/app/review/archive") {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-5 pb-2 md:min-h-[calc(100dvh-7rem)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            选一科，和 Sage 聊聊今天哪里卡住——用问题把模糊变成具体。
          </p>
        </div>
        <Link
          to="/app/review/archive"
          className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          查看我的弱点档案
        </Link>
      </header>

      {hasReviewCols === false && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>需要数据库迁移</AlertTitle>
          <AlertDescription className="text-sm">{MIGRATION_HINT}</AlertDescription>
        </Alert>
      )}

      {hasReviewCols === true && showOnboardingBanner && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.08] px-4 py-3 text-sm text-foreground shadow-sm">
          <p className="font-medium text-sky-950 dark:text-sky-50">
            欢迎来到 Sage。我们先做一件事：找到你今天最卡的那道题。
          </p>
          <p className="mt-1 text-sky-900/90 dark:text-sky-100/90">
            选一科，告诉我你今天遇到了什么问题。
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="lg:w-56 lg:shrink-0 lg:border-r lg:border-border lg:pr-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sessions
          </p>
          <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto lg:max-h-none">
            {(["全部", ...SUBJECTS] as SidebarSessionFilter[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSidebarSessionFilter(tab)}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  sidebarSessionFilter === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted",
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto lg:max-h-[min(380px,50vh)]">
            {filteredSessionRows.map((s) => {
              const rowActive = selectedDate === s.session_date && subject === s.subject;
              return (
                <li key={`${s.session_date}-${s.subject}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (SUBJECTS.includes(s.subject as Subject)) {
                        setSubject(s.subject as Subject);
                      }
                      setSelectedDate(s.session_date);
                    }}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left text-sm transition",
                      rowActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="block text-foreground">{formatDateLabel(s.session_date)}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                      <span>{s.session_date}</span>
                      {sidebarSessionFilter === "全部" ? (
                        <span className="rounded border border-border bg-card px-1 py-px text-[10px] text-foreground/80">
                          {s.subject}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredSessionRows.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">
                {sessionIndex.length === 0
                  ? "暂无记录，从下面「今天」开始。"
                  : "该科目下暂无会话。"}
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setSelectedDate(localYmd());
            }}
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

          <div className={cn(hasReviewCols === false && "pointer-events-none opacity-40")}>
            <SageChatPanel
              messages={messages}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={() => void send()}
              isSending={isSending}
              emptyTitle="从这里开始复盘"
              emptyHint="说说今天这科哪里最耗你、最不想碰，或最懵的一道题。"
              placeholder={
                hasReviewCols === false ? "请先完成上方数据库迁移" : `聊聊今天的「${subject}」…`
              }
              className="min-h-[320px] md:min-h-[420px]"
              betweenScrollAndInput={
                hasReviewCols === true && userMessageCount >= 3 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl border-dashed"
                    onClick={onEndReviewClick}
                  >
                    结束复盘
                  </Button>
                ) : null
              }
              belowForm={summaryBelow}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
