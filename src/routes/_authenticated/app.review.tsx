import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import { buildReviewDeepSeekSystemPrompt } from "@/lib/sage-system-prompt";
import { filterCoachMessagesForSession } from "@/lib/review-session-messages";
import { fetchUserExams, pickNearestExam } from "@/lib/user-exams";
import { invokeDeepSeekChat, isRetryableNetworkFailure } from "@/lib/deepseek-supabase";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  ONBOARDING_REVIEW_SUBJECT,
  POST_FIRST_ONBOARDING_SESSION_CLOSING,
  POST_REVIEW_SESSION_CLOSING,
  REVIEW_GUIDED_FIRST_OPENING,
  REVIEW_RETURNING_FIRST_OPENING,
} from "@/lib/review-opening";
import { assistantSignalsCorrectness } from "@/lib/review-positive-feedback";
import {
  formatReviewConversationForSummary,
  parsePartialReviewSummaryStream,
  requestReviewSummaryStructured,
} from "@/lib/review-summary";
import { buildReviewSummaryInsertRow, persistReviewSummary } from "@/lib/review-summary-db";
import { logSupabaseError } from "@/lib/supabase-errors";
import type { PostgrestError } from "@supabase/supabase-js";

/** Invisible thread anchor: listed in session index, excluded from chat (role system). */
const REVIEW_SESSION_ANCHOR = "__review_session_anchor_v1__";

type CoachMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  review_session_slug?: string | null;
  review_subject?: string | null;
};

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

/** e.g. 5月14日 化学 14:30 */
function formatSessionSidebarLabel(sessionDate: string, subject: string, startedAtIso: string) {
  const [y, mo, da] = sessionDate.split("-").map(Number);
  const t = new Date(startedAtIso);
  const time = t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${mo}月${da}日 ${subject} ${time}`;
}

type SessionRow = {
  session_slug: string;
  session_date: string;
  subject: string;
  started_at: string;
};
type SidebarSessionFilter = "全部" | Subject;

const SPRINT_EXAM_MAX_DAYS = 30;

type SessionCardState =
  | null
  | { kind: "loading" }
  | {
      kind: "streaming";
      subject?: string;
      weak_point?: string;
      tonight_task?: string;
      follow_up?: string;
      mastered?: string | null;
    }
  | {
      kind: "full";
      subject: string;
      weak_point: string;
      tonight_task: string;
      follow_up: string;
      mastered: string | null;
    };

function Review() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [selectedDate, setSelectedDate] = useState(() => localYmd());
  const [sidebarSessionFilter, setSidebarSessionFilter] = useState<SidebarSessionFilter>("全部");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamAssistantText, setStreamAssistantText] = useState<string | null>(null);
  const [sessionCard, setSessionCard] = useState<SessionCardState>(null);
  const [isEndingReview, setIsEndingReview] = useState(false);
  const summaryDoneKeysRef = useRef(new Set<string>());
  const openingFlightRef = useRef(false);
  const subjectRef = useRef(subject);
  const selectedDateRef = useRef(selectedDate);
  subjectRef.current = subject;
  selectedDateRef.current = selectedDate;

  const [activeSessionSlug, setActiveSessionSlug] = useState<string | null>(null);
  const [chatRetrying, setChatRetrying] = useState(false);
  const [deleteDialogSession, setDeleteDialogSession] = useState<SessionRow | null>(null);
  const slugResolveGenRef = useRef(0);
  const slugNavSourceRef = useRef<"control" | "sidebar" | "plus" | "opening">("control");
  const sendAbortRef = useRef<AbortController | null>(null);
  /** When true, the next subject-driven effect must not clear session (sidebar / session picker just set subject+date+slug). */
  const preserveSessionFromPickerRef = useRef(false);
  const skipSubjectScopeEffectRef = useRef(false);

  const { data: profileFlags, isSuccess: profileFlagsReady } = useQuery({
    queryKey: ["profile-flags", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async (): Promise<{
      needsGuidedReviewOnboarding: boolean;
    }> => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("review_onboarding_complete")
          .eq("id", user!.id)
          .maybeSingle();
        if (error) {
          console.warn("[profiles] review_onboarding flags skipped", error);
          return { needsGuidedReviewOnboarding: false };
        }
        return { needsGuidedReviewOnboarding: data?.review_onboarding_complete === false };
      } catch (e) {
        console.warn("[profiles] review_onboarding flags skipped", e);
        return { needsGuidedReviewOnboarding: false };
      }
    },
  });

  const onboardingIncomplete =
    profileFlagsReady && profileFlags?.needsGuidedReviewOnboarding === true;

  const bumpSessionScope = useCallback(() => {
    slugResolveGenRef.current += 1;
    return slugResolveGenRef.current;
  }, []);

  const resetChatUiForScopeChange = useCallback(() => {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setStreamAssistantText(null);
    setDraft("");
    setIsSending(false);
    setChatRetrying(false);
  }, []);

  /** Synchronous subject switch: clear session + UI so history never mixes across subjects. */
  const switchSubject = useCallback(
    (nextSubject: string) => {
      if (onboardingIncomplete) return;
      skipSubjectScopeEffectRef.current = true;
      bumpSessionScope();
      resetChatUiForScopeChange();
      setActiveSessionSlug(null);
      setSelectedDate(localYmd());
      setSubject(nextSubject);
      if (user?.id) {
        void qc.cancelQueries({ queryKey: ["review-messages", user.id] });
      }
    },
    [bumpSessionScope, resetChatUiForScopeChange, onboardingIncomplete, user?.id, qc],
  );

  const loadSessionFromPicker = useCallback(
    (row: { subject: string; session_date: string; session_slug: string }) => {
      preserveSessionFromPickerRef.current = true;
      slugNavSourceRef.current = "sidebar";
      bumpSessionScope();
      resetChatUiForScopeChange();
      setSubject(row.subject);
      setSelectedDate(row.session_date);
      setActiveSessionSlug(row.session_slug);
    },
    [bumpSessionScope, resetChatUiForScopeChange],
  );

  const { data: examRows = [] } = useQuery({
    queryKey: ["user-exams", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        return await fetchUserExams(user!.id);
      } catch (e) {
        console.warn("[user-exams] query skipped", e);
        return [];
      }
    },
    staleTime: 60_000,
  });

  const nearestExam = useMemo(() => pickNearestExam(examRows), [examRows]);
  const sprintMode =
    nearestExam !== null && nearestExam.days >= 0 && nearestExam.days <= SPRINT_EXAM_MAX_DAYS;

  const chatSubject = onboardingIncomplete ? ONBOARDING_REVIEW_SUBJECT : subject;

  useEffect(() => {
    if (!profileFlagsReady) return;
    if (profileFlags?.needsGuidedReviewOnboarding === true) {
      slugResolveGenRef.current += 1;
      setActiveSessionSlug(null);
      setSubject(ONBOARDING_REVIEW_SUBJECT);
      setSelectedDate(localYmd());
    }
  }, [profileFlagsReady, profileFlags?.needsGuidedReviewOnboarding]);

  useEffect(() => {
    if (onboardingIncomplete) return;
    if (preserveSessionFromPickerRef.current) {
      preserveSessionFromPickerRef.current = false;
      return;
    }
    if (skipSubjectScopeEffectRef.current) {
      skipSubjectScopeEffectRef.current = false;
      return;
    }
    bumpSessionScope();
    resetChatUiForScopeChange();
    setActiveSessionSlug(null);
    setSelectedDate(localYmd());
  }, [subject, onboardingIncomplete, bumpSessionScope, resetChatUiForScopeChange]);

  useEffect(() => {
    setSessionCard(null);
  }, [subject, selectedDate, activeSessionSlug]);

  const { data: hasAnyReviewMessages } = useQuery({
    queryKey: ["review-prior-any", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from("coach_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .not("review_subject", "is", null);
        if (error) {
          console.warn("[review-prior-any] count query failed", error);
          return false;
        }
        return (count ?? 0) > 0;
      } catch (e) {
        console.warn("[review-prior-any] count query failed", e);
        return false;
      }
    },
  });

  useEffect(() => {
    if (!user?.id || hasAnyReviewMessages !== false || !profileFlagsReady) return;
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

      const sub = onboardingIncomplete ? ONBOARDING_REVIEW_SUBJECT : subjectRef.current;
      const dt = selectedDateRef.current;
      slugResolveGenRef.current += 1;
      slugNavSourceRef.current = "opening";
      const openingSlug = crypto.randomUUID();
      setActiveSessionSlug(openingSlug);
      const opening = onboardingIncomplete
        ? REVIEW_GUIDED_FIRST_OPENING
        : REVIEW_RETURNING_FIRST_OPENING;
      const { error } = await supabase.from("coach_messages").insert({
        user_id: uid,
        role: "assistant",
        content: opening,
        review_subject: sub,
        review_session_date: dt,
        review_session_slug: openingSlug,
      });
      openingFlightRef.current = false;
      if (cancelled || error) {
        if (error) console.error(error);
        slugNavSourceRef.current = "control";
        return;
      }
      slugNavSourceRef.current = "control";
      slugResolveGenRef.current += 1;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-prior-any", uid] }),
        qc.invalidateQueries({ queryKey: ["review-sessions-index", uid] }),
        qc.invalidateQueries({ queryKey: ["review-messages", uid, openingSlug, sub] }),
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, hasAnyReviewMessages, profileFlagsReady, onboardingIncomplete, qc]);

  const { data: sessionIndex = [] } = useQuery({
    queryKey: ["review-sessions-index", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("coach_messages")
          .select("review_session_slug,review_session_date,review_subject,created_at")
          .eq("user_id", user!.id)
          .not("review_session_date", "is", null)
          .not("review_subject", "is", null)
          .not("review_session_slug", "is", null)
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("[review-sessions-index]", error);
          return [];
        }
        const bySlug = new Map<
          string,
          { session_date: string; subject: string; started_at: string }
        >();
        for (const row of data ?? []) {
          const sl = row.review_session_slug;
          const d = row.review_session_date;
          const subj = row.review_subject;
          const ca = row.created_at;
          if (!sl || !d || !subj || !ca) continue;
          if (!bySlug.has(sl)) {
            bySlug.set(sl, { session_date: d, subject: subj, started_at: ca });
          }
        }
        const list: SessionRow[] = [...bySlug.entries()].map(([session_slug, v]) => ({
          session_slug,
          session_date: v.session_date,
          subject: v.subject,
          started_at: v.started_at,
        }));
        list.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
        return list;
      } catch (e) {
        console.warn("[review-sessions-index]", e);
        return [];
      }
    },
  });

  const filteredSessionRows = useMemo(() => {
    if (sidebarSessionFilter === "全部") return sessionIndex;
    return sessionIndex.filter((s) => s.subject === sidebarSessionFilter);
  }, [sessionIndex, sidebarSessionFilter]);

  const hasSessionForSelectedDate = useMemo(
    () => sessionIndex.some((s) => s.session_date === selectedDate && s.subject === chatSubject),
    [sessionIndex, selectedDate, chatSubject],
  );

  const activeSessionKey = activeSessionSlug ?? "__pending__";

  const [msgSkeletonDeadline, setMsgSkeletonDeadline] = useState(false);
  useEffect(() => {
    setMsgSkeletonDeadline(false);
    const t = setTimeout(() => setMsgSkeletonDeadline(true), 2000);
    return () => clearTimeout(t);
  }, [activeSessionKey]);

  const {
    data: messageRowsRaw,
    isPending: messagesPending,
    isFetching: messagesFetching,
    isFetched: messagesFetched,
  } = useQuery({
    queryKey: ["review-messages", user?.id, activeSessionSlug, chatSubject],
    enabled: !!user?.id && !!activeSessionSlug,
    placeholderData: undefined,
    queryFn: async (): Promise<CoachMessageRow[]> => {
      const slug = activeSessionSlug as string;
      try {
        const { data, error } = await supabase
          .from("coach_messages")
          .select("id,role,content,created_at,review_session_slug,review_subject")
          .eq("user_id", user!.id)
          .eq("review_session_slug", slug)
          .eq("review_subject", chatSubject)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("[review-messages]", error);
          return [];
        }
        const rows = (data ?? []) as CoachMessageRow[];
        const filtered = filterCoachMessagesForSession(rows, slug, chatSubject);
        return filtered.map(({ id, role, content, created_at, review_session_slug }) => ({
          id,
          role,
          content,
          created_at,
          review_session_slug,
        }));
      } catch (e) {
        console.warn("[review-messages]", e);
        return [];
      }
    },
  });

  /** Never show cached messages from another session while slug is clearing or switching. */
  const messageRows =
    activeSessionSlug && messageRowsRaw
      ? filterCoachMessagesForSession(messageRowsRaw, activeSessionSlug, chatSubject)
      : [];

  const showHistorySkeleton =
    !msgSkeletonDeadline &&
    !!activeSessionSlug &&
    (messagesPending || messagesFetching) &&
    messageRows.length === 0;

  const messages: SageChatMessage[] = useMemo(
    () =>
      messageRows
        .filter((m): m is CoachMessageRow => typeof m.id === "string")
        .map((m) => ({
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

  const mobileSessionOptions = useMemo(() => {
    const rows = sessionIndex.filter((s) => s.subject === chatSubject);
    rows.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    return rows;
  }, [sessionIndex, chatSubject]);

  const dateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessionIndex) set.add(s.session_date);
    set.add(localYmd());
    set.add(selectedDate);
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [sessionIndex, selectedDate]);

  const runSilentSummary = useCallback(async () => {
    if (!user?.id || !activeSessionSlug) return;
    const key = activeSessionSlug;
    if (summaryDoneKeysRef.current.has(key)) return;

    const summarySlug = activeSessionSlug;
    const summarySubject = chatSubject;
    const summaryGen = slugResolveGenRef.current;

    const { data: histRows, error: histErr } = await supabase
      .from("coach_messages")
      .select("role,content,review_session_slug,review_subject")
      .eq("user_id", user.id)
      .eq("review_session_slug", summarySlug)
      .eq("review_subject", summarySubject)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });
    if (histErr) {
      console.warn("[review-summary] history fetch", histErr);
      setSessionCard(null);
      setIsEndingReview(false);
      return;
    }
    if (slugResolveGenRef.current !== summaryGen) {
      setSessionCard(null);
      setIsEndingReview(false);
      return;
    }
    const historyRows = filterCoachMessagesForSession(
      histRows ?? [],
      summarySlug,
      summarySubject,
    );

    const transcript = formatReviewConversationForSummary(historyRows);
    if (!transcript.trim()) {
      setSessionCard(null);
      setIsEndingReview(false);
      return;
    }

    summaryDoneKeysRef.current.add(key);
    setSessionCard({ kind: "streaming" });

    const wasGuidedFirst = onboardingIncomplete;

    try {
      if (import.meta.env.DEV) {
        console.log("[review-summary] runSilentSummary", {
          key,
          messageCount: historyRows.length,
          transcriptChars: transcript.length,
        });
      }
      let summaryStreamRaf = 0;
      let pendingSummaryStream = "";
      const flushSummaryStreamToUi = () => {
        summaryStreamRaf = 0;
        const partial = parsePartialReviewSummaryStream(pendingSummaryStream);
        setSessionCard({
          kind: "streaming",
          subject: partial.subject,
          weak_point: partial.weak_point,
          tonight_task: partial.tonight_task,
          follow_up: partial.follow_up,
          mastered: partial.mastered,
        });
      };

      const parsed = await requestReviewSummaryStructured(transcript, {
        onDelta: (full) => {
          pendingSummaryStream = full;
          if (!summaryStreamRaf) {
            summaryStreamRaf = requestAnimationFrame(flushSummaryStreamToUi);
          }
        },
      });
      if (summaryStreamRaf) cancelAnimationFrame(summaryStreamRaf);
      if (!parsed) throw new Error("parse");
      const subjectLabel = parsed.subject.trim() || chatSubject;
      const row = buildReviewSummaryInsertRow({
        userId: user.id,
        sessionDate: selectedDate,
        subject: subjectLabel,
        parsed,
        reviewSessionSlug: activeSessionSlug,
      });
      await persistReviewSummary(row, supabase);

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

      const closingContent = wasGuidedFirst
        ? POST_FIRST_ONBOARDING_SESSION_CLOSING
        : POST_REVIEW_SESSION_CLOSING;

      const { error: closingErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: closingContent,
        review_subject: chatSubject,
        review_session_date: selectedDate,
        review_session_slug: activeSessionSlug,
      });
      if (closingErr) console.error(closingErr);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-summaries", user.id] }),
        qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-tasks", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-sage-hook", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] }),
        qc.invalidateQueries({
          queryKey: ["review-messages", user.id, activeSessionSlug, chatSubject],
        }),
        qc.invalidateQueries({ queryKey: ["profile-flags", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-summary-meta", user.id] }),
      ]);
      window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));
    } catch (e) {
      summaryDoneKeysRef.current.delete(key);
      setSessionCard(null);
      const pg = e as PostgrestError;
      if (pg?.code && pg?.message) {
        logSupabaseError("review-summary runSilentSummary", pg, {
          key,
          transcriptChars: transcript.length,
        });
      } else {
        console.error("[review-summary] runSilentSummary failed", {
          key,
          transcriptChars: transcript.length,
          message: e instanceof Error ? e.message : String(e),
          error: e,
        });
      }
    } finally {
      setIsEndingReview(false);
    }
  }, [chatSubject, selectedDate, user, qc, onboardingIncomplete, activeSessionSlug]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !user?.id || isSending) return;

    const sendGen = slugResolveGenRef.current;
    const scopeSubject = chatSubject;
    const scopeDate = selectedDate;

    sendAbortRef.current?.abort();
    const abortController = new AbortController();
    sendAbortRef.current = abortController;

    setIsSending(true);
    setChatRetrying(false);
    let clearedDraft = false;

    const scopeStale = () => slugResolveGenRef.current !== sendGen;

    try {
      let sessionSlug = activeSessionSlug;
      if (!sessionSlug) {
        sessionSlug = crypto.randomUUID();
        slugNavSourceRef.current = "plus";
        setActiveSessionSlug(sessionSlug);
      }

      if (scopeStale()) return;

      const { error: uErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "user",
        content: text,
        review_subject: scopeSubject,
        review_session_date: scopeDate,
        review_session_slug: sessionSlug,
      });
      if (uErr) throw uErr;

      setDraft("");
      clearedDraft = true;

      if (scopeStale()) return;

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({
        queryKey: ["review-messages", user.id, sessionSlug, scopeSubject],
      });

      const { data: historyAfterUser, error: h0Err } = await supabase
        .from("coach_messages")
        .select("role,content,review_session_slug,review_subject")
        .eq("user_id", user.id)
        .eq("review_session_slug", sessionSlug)
        .eq("review_subject", scopeSubject)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (h0Err) throw h0Err;
      if (scopeStale()) return;

      const historyForApi = filterCoachMessagesForSession(
        historyAfterUser ?? [],
        sessionSlug,
        scopeSubject,
      );

      const sys = buildReviewDeepSeekSystemPrompt({
        subject: scopeSubject,
        sessionDate: scopeDate,
        onboardingIncomplete,
        sprintMode,
      });
      const apiMessages = [
        { role: "system" as const, content: sys },
        ...historyForApi.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      if (import.meta.env.DEV) {
        console.log("[review-send] DeepSeek request", {
          sessionSlug,
          reviewSubject: scopeSubject,
          sendGen,
          historyRows: historyForApi.length,
        });
      }

      setStreamAssistantText("");
      let streamRaf = 0;
      let pendingStream = "";
      const flushStreamToUi = () => {
        streamRaf = 0;
        if (scopeStale()) return;
        setStreamAssistantText(pendingStream);
      };

      let reply: string;
      try {
        reply = await invokeDeepSeekChat(apiMessages, {
          max_tokens: 2000,
          signal: abortController.signal,
          onRetrying: () => setChatRetrying(true),
          onDelta: (full) => {
            pendingStream = full;
            if (!streamRaf) {
              streamRaf = requestAnimationFrame(flushStreamToUi);
            }
          },
        });
        if (streamRaf) cancelAnimationFrame(streamRaf);
        setStreamAssistantText(reply);
      } catch (streamErr) {
        if (streamRaf) cancelAnimationFrame(streamRaf);
        setStreamAssistantText(null);
        setChatRetrying(false);
        if (scopeStale() || (streamErr instanceof DOMException && streamErr.name === "AbortError")) {
          return;
        }
        const net = isRetryableNetworkFailure(streamErr);
        toast.error(
          net
            ? "网络不稳定，请再发一次"
            : streamErr instanceof Error
              ? streamErr.message
              : "发送失败",
        );
        setDraft(text);
        return;
      } finally {
        setChatRetrying(false);
      }

      if (scopeStale()) return;

      const { error: aErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: reply,
        review_subject: scopeSubject,
        review_session_date: scopeDate,
        review_session_slug: sessionSlug,
      });
      if (aErr) throw aErr;

      if (scopeStale()) return;

      if (assistantSignalsCorrectness(reply)) {
        window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));
        void qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] });
        void qc.invalidateQueries({ queryKey: ["today-tasks", user.id] });
      }

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({
        queryKey: ["review-messages", user.id, sessionSlug, scopeSubject],
      });
      setStreamAssistantText(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (scopeStale()) return;
      if (clearedDraft && text) setDraft(text);
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setStreamAssistantText(null);
      setChatRetrying(false);
      setIsSending(false);
      slugNavSourceRef.current = "control";
    }
  }, [
    draft,
    user?.id,
    isSending,
    chatSubject,
    selectedDate,
    qc,
    onboardingIncomplete,
    sprintMode,
    activeSessionSlug,
    bumpSessionScope,
  ]);

  const onEndReviewClick = useCallback(() => {
    if (userMessageCount < 3 || isEndingReview) return;
    setSessionCard({ kind: "loading" });
    setIsEndingReview(true);
    void runSilentSummary();
  }, [userMessageCount, runSilentSummary, isEndingReview]);

  const startTodaySession = useCallback(async () => {
    const today = localYmd();
    if (!user?.id) return;
    try {
      const subj = onboardingIncomplete ? ONBOARDING_REVIEW_SUBJECT : subject;
      const newSlug = crypto.randomUUID();
      slugNavSourceRef.current = "plus";
      slugResolveGenRef.current += 1;
      setSelectedDate(today);
      setActiveSessionSlug(newSlug);

      const { error: iErr } = await supabase.from("coach_messages").insert({
        user_id: user.id,
        role: "system",
        content: REVIEW_SESSION_ANCHOR,
        review_subject: subj,
        review_session_date: today,
        review_session_slug: newSlug,
      });
      if (iErr) console.warn("[startTodaySession] insert", iErr);

      slugNavSourceRef.current = "control";
      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({ queryKey: ["review-messages", user.id, newSlug, subj] });
    } catch (e) {
      console.warn("[startTodaySession]", e);
      slugNavSourceRef.current = "control";
    }
  }, [user?.id, qc, onboardingIncomplete, subject]);

  const confirmDeleteSession = useCallback(async () => {
    const row = deleteDialogSession;
    if (!user?.id || !row) return;
    const slug = row.session_slug;
    setDeleteDialogSession(null);
    if (activeSessionSlug === slug) {
      setActiveSessionSlug(null);
    }
    const prevIndex =
      qc.getQueryData<SessionRow[]>(["review-sessions-index", user.id]) ?? sessionIndex;
    qc.setQueryData<SessionRow[]>(
      ["review-sessions-index", user.id],
      prevIndex.filter((s) => s.session_slug !== slug),
    );
    try {
      const { error: mErr } = await supabase
        .from("coach_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("review_session_slug", slug);
      if (mErr) console.warn("[delete-session] messages", mErr);
      const { error: sErr } = await supabase
        .from("review_summaries")
        .delete()
        .eq("user_id", user.id)
        .eq("review_session_slug", slug);
      if (sErr) console.warn("[delete-session] summaries", sErr);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-messages", user.id, slug, row.subject] }),
        qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-tasks", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-summary-meta", user.id] }),
      ]);
      window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));
    } catch (e) {
      console.warn("[delete-session]", e);
      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
    }
  }, [user?.id, deleteDialogSession, qc, sessionIndex, activeSessionSlug]);

  const summaryBelow =
    sessionCard?.kind === "loading" ? (
      <ReviewSummaryCard variant="skeleton" />
    ) : sessionCard?.kind === "streaming" ? (
      <ReviewSummaryCard
        variant="streaming"
        subject={sessionCard.subject}
        weakPoint={sessionCard.weak_point}
        tonightTask={sessionCard.tonight_task}
        followUp={sessionCard.follow_up}
        mastered={sessionCard.mastered}
      />
    ) : sessionCard?.kind === "full" ? (
      <ReviewSummaryCard
        subject={sessionCard.subject}
        weakPoint={sessionCard.weak_point}
        tonightTask={sessionCard.tonight_task}
        followUp={sessionCard.follow_up}
        mastered={sessionCard.mastered}
      />
    ) : null;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/app/review/archive") {
    return <Outlet />;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5">
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

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 md:px-5",
          "lg:flex-row lg:items-stretch",
        )}
      >
        <aside className="hidden lg:block lg:w-56 lg:shrink-0 lg:border-r lg:border-border lg:pr-5">
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
              const rowActive = activeSessionSlug === s.session_slug;
              return (
                <li key={s.session_slug} className="flex items-stretch gap-0.5">
                  <button
                    type="button"
                    onClick={() => loadSessionFromPicker(s)}
                    className={cn(
                      "min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left text-sm transition",
                      rowActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="block text-foreground">
                      {formatSessionSidebarLabel(s.session_date, s.subject, s.started_at)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                      <span>{s.session_date}</span>
                      {sidebarSessionFilter === "全部" ? (
                        <span className="rounded border border-border bg-card px-1 py-px text-[10px] text-foreground/80">
                          {s.subject}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="grid h-9 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="会话选项"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteDialogSession(s)}
                      >
                        删除对话
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            onClick={() => void startTodaySession()}
            className={cn(
              "mt-2 w-full rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-sm transition hover:bg-muted",
              selectedDate === localYmd() && activeSessionSlug && "border-primary/40 bg-primary/5",
            )}
          >
            + 今天 · {localYmd()}
          </button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">科目</p>
            {onboardingIncomplete ? (
              <p className="text-sm text-muted-foreground">
                首次复盘使用「{ONBOARDING_REVIEW_SUBJECT}」引导；完成后即可按科目复盘。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => switchSubject(s)}
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
            )}
          </div>

          <div className="hidden lg:block">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {mobileSessionOptions.length > 0 ? "复盘场次" : "复盘日期"}
            </p>
            {mobileSessionOptions.length > 0 ? (
              <Select
                value={activeSessionSlug ?? "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") return;
                  const row = mobileSessionOptions.find((r) => r.session_slug === v);
                  if (!row) return;
                  loadSessionFromPicker(row);
                }}
              >
                <SelectTrigger className="rounded-xl border-border bg-card">
                  <SelectValue placeholder="选择场次" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    选择场次
                  </SelectItem>
                  {mobileSessionOptions.map((s) => (
                    <SelectItem key={s.session_slug} value={s.session_slug}>
                      {formatSessionSidebarLabel(s.session_date, s.subject, s.started_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={selectedDate}
                onValueChange={(d) => {
                  bumpSessionScope();
                  resetChatUiForScopeChange();
                  setActiveSessionSlug(null);
                  setSelectedDate(d);
                }}
              >
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
            )}
          </div>

          {!onboardingIncomplete && !hasSessionForSelectedDate && messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              这是新会话；发第一条消息后，该日期会出现在左侧列表。
            </p>
          )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col max-lg:h-[calc(100dvh-120px)]">
          <SageChatPanel
              messages={messages}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={() => void send()}
              isSending={isSending}
              emptyTitle={onboardingIncomplete ? "从这里开始" : "从这里开始复盘"}
              emptyHint={
                onboardingIncomplete
                  ? "先看 Sage 的第一条消息，然后随便用你自己的话说说就好。"
                  : "说说今天这科哪里最耗你、最不想碰，或最懵的一道题。"
              }
              placeholder={onboardingIncomplete ? "说说你的感觉…" : `聊聊今天的「${chatSubject}」…`}
              expand
              className="min-h-0 flex-1"
              showHistorySkeleton={showHistorySkeleton}
              streamingAssistantText={streamAssistantText}
              composerHint={
                chatRetrying ? "重试中…" : isSending ? "Sage 正在输入…" : null
              }
              betweenScrollAndInput={
                userMessageCount >= 3 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl border-dashed"
                    disabled={isEndingReview}
                    onClick={onEndReviewClick}
                  >
                    {isEndingReview ? "正在生成小结…" : "结束复盘"}
                  </Button>
                ) : null
              }
              belowForm={summaryBelow}
            />
          </div>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogSession !== null}
        onOpenChange={(o) => !o && setDeleteDialogSession(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除复盘记录</AlertDialogTitle>
            <AlertDialogDescription>确定删除这条复盘记录吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteSession()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
