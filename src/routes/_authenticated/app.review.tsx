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
  revokePendingChatImage,
  type PendingChatImage,
} from "@/components/chat-image-picker";
import { compressImageToDataUrl } from "@/lib/image-compress";
import {
  analyzeQuestionPhoto,
  normalizePhotoMarkdown,
  wrapPhotoMarkdown,
} from "@/lib/question-photo-analysis";
import {
  isPhotoOnlyMessageContent,
  SAGE_PHOTO_MESSAGE_MARKER,
  stripPhotoImagesFromMessages,
} from "@/lib/review-photo-messages";
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
import { subjectAccentTaskClass } from "@/lib/subject-accent";
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
  isReviewWrapUpMessage,
} from "@/lib/review-opening";
import { assistantSignalsCorrectness } from "@/lib/review-positive-feedback";
import {
  formatReviewConversationForSummary,
  parsePartialReviewSummaryStream,
  requestReviewSummaryStructured,
} from "@/lib/review-summary";
import {
  buildReviewSummaryInsertRow,
  findExistingReviewSummary,
  persistReviewSummary,
} from "@/lib/review-summary-db";
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

/** e.g. 5月14日 化学 14:30 — desktop sidebar / select (subject in label). */
function formatSessionSidebarLabel(sessionDate: string, subject: string, startedAtIso: string) {
  const [, mo, da] = sessionDate.split("-").map(Number);
  const time = formatSessionTime(startedAtIso);
  return `${mo}月${da}日 ${subject} ${time}`;
}

/** e.g. 5月26日 20:35 — mobile drawer subtitle (subject already in badge). */
function formatSessionDateTimeLabel(sessionDate: string, startedAtIso: string) {
  const [, mo, da] = sessionDate.split("-").map(Number);
  return `${mo}月${da}日 ${formatSessionTime(startedAtIso)}`;
}

function formatSessionTime(startedAtIso: string) {
  const t = new Date(startedAtIso);
  return t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type SessionRow = {
  session_slug: string;
  session_date: string;
  subject: string;
  started_at: string;
};

const MOBILE_SUBJECT_TAG_STYLES: Record<string, { bg: string; color: string }> = {
  语文: { bg: "#fef3c7", color: "#92400e" },
  数学: { bg: "#dbeafe", color: "#1e40af" },
  英语: { bg: "#d1fae5", color: "#065f46" },
  物理: { bg: "#ede9fe", color: "#5b21b6" },
  化学: { bg: "#fce7f3", color: "#9d174d" },
  生物: { bg: "#ccfbf1", color: "#065f46" },
  政治: { bg: "#fee2e2", color: "#991b1b" },
  历史: { bg: "#ffedd5", color: "#9a3412" },
  地理: { bg: "#f3f4f6", color: "#374151" },
};

function drawerDateGroupLabel(sessionDate: string) {
  const today = localYmd();
  const yesterday = localYmd(new Date(Date.now() - 86_400_000));
  if (sessionDate === today) return "今天";
  if (sessionDate === yesterday) return "昨天";
  const [, mo, da] = sessionDate.split("-").map(Number);
  return `${mo}月${da}日`;
}

function groupSessionsForDrawer(rows: SessionRow[]) {
  const order = ["今天", "昨天"];
  const map = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const label = drawerDateGroupLabel(row.session_date);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(row);
  }
  const dated = [...map.keys()].filter((k) => !order.includes(k));
  dated.sort((a, b) => {
    const rowA = map.get(a)?.[0];
    const rowB = map.get(b)?.[0];
    if (!rowA || !rowB) return 0;
    return rowB.session_date.localeCompare(rowA.session_date);
  });
  const labels = [...order.filter((l) => map.has(l)), ...dated];
  return labels.map((label) => ({ label, rows: map.get(label) ?? [] }));
}

type SidebarSessionFilter = "全部" | Subject;

type SessionCardState =
  | null
  | { kind: "loading" }
  | { kind: "error"; message: string }
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

type SubjectChatCache = {
  messages: SageChatMessage[];
  messageRows: CoachMessageRow[];
  activeSessionSlug: string | null;
  selectedDate: string;
  sessionCard: SessionCardState;
};

function emptySubjectChatCache(): SubjectChatCache {
  return {
    messages: [],
    messageRows: [],
    activeSessionSlug: null,
    selectedDate: localYmd(),
    sessionCard: null,
  };
}

function createChatsBySubject(): Record<string, SubjectChatCache> {
  return Object.fromEntries(SUBJECTS.map((s) => [s, emptySubjectChatCache()])) as Record<
    string,
    SubjectChatCache
  >;
}

const SPRINT_EXAM_MAX_DAYS = 30;
const SUMMARY_STREAM_TIMEOUT_MS = 10_000;

function Review() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [selectedDate, setSelectedDate] = useState(() => localYmd());
  const [sidebarSessionFilter, setSidebarSessionFilter] = useState<SidebarSessionFilter>("全部");
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingChatImage | null>(null);
  const [streamingPhotoMarkdown, setStreamingPhotoMarkdown] = useState<string | null>(null);
  const [photoAnalysisLoading, setPhotoAnalysisLoading] = useState(false);
  const [subjectChatLoading, setSubjectChatLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamAssistantText, setStreamAssistantText] = useState<string | null>(null);
  const [sessionCard, setSessionCard] = useState<SessionCardState>(null);
  const [isEndingReview, setIsEndingReview] = useState(false);
  const [isSummarySubmitting, setIsSummarySubmitting] = useState(false);
  const [subjectsWithEndedReview, setSubjectsWithEndedReview] = useState<Set<string>>(
    () => new Set(),
  );
  const summaryDoneKeysRef = useRef(new Set<string>());
  const summaryInFlightRef = useRef(false);
  const summaryStreamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pins the summary card to a session; cleared only on subject switch or scope change. */
  const summaryCardScopeRef = useRef<{
    subject: string;
    sessionDate: string;
    sessionSlug: string;
  } | null>(null);
  const openingFlightRef = useRef(false);
  const subjectRef = useRef(subject);
  const selectedDateRef = useRef(selectedDate);
  subjectRef.current = subject;
  selectedDateRef.current = selectedDate;

  const [activeSessionSlug, setActiveSessionSlug] = useState<string | null>(null);
  const [chatRetrying, setChatRetrying] = useState(false);
  const [deleteDialogSession, setDeleteDialogSession] = useState<SessionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slugResolveGenRef = useRef(0);
  const slugNavSourceRef = useRef<"control" | "sidebar" | "plus" | "opening">("control");
  const sendAbortRef = useRef<AbortController | null>(null);
  /** When true, the next subject-driven effect must not clear session (sidebar / session picker just set subject+date+slug). */
  const preserveSessionFromPickerRef = useRef(false);
  const skipSubjectScopeEffectRef = useRef(false);
  const chatsBySubject = useRef<Record<string, SubjectChatCache>>(createChatsBySubject());
  /** Synchronous subject guard for message fetch / render (avoids race on fast tab switch). */
  const activeChatSubjectRef = useRef(subject);
  activeChatSubjectRef.current = subject;

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
    setPendingImage((prev) => {
      revokePendingChatImage(prev);
      return null;
    });
    setStreamingPhotoMarkdown(null);
    setPhotoAnalysisLoading(false);
    setIsSending(false);
    setChatRetrying(false);
  }, []);

  const handleImageSelected = useCallback((image: PendingChatImage) => {
    setPendingImage((prev) => {
      revokePendingChatImage(prev);
      return image;
    });
  }, []);

  const handleClearImage = useCallback(() => {
    setPendingImage((prev) => {
      revokePendingChatImage(prev);
      return null;
    });
  }, []);

  const clearCurrentSubjectChat = useCallback(() => {
    if (onboardingIncomplete) return;
    chatsBySubject.current[subject] = emptySubjectChatCache();
    bumpSessionScope();
    resetChatUiForScopeChange();
    setActiveSessionSlug(null);
    setSelectedDate(localYmd());
    if (user?.id) {
      void qc.cancelQueries({ queryKey: ["review-messages", user.id] });
    }
  }, [
    subject,
    onboardingIncomplete,
    bumpSessionScope,
    resetChatUiForScopeChange,
    user?.id,
    qc,
  ]);

  const loadSessionFromPicker = useCallback(
    (row: { subject: string; session_date: string; session_slug: string }) => {
      preserveSessionFromPickerRef.current = true;
      slugNavSourceRef.current = "sidebar";
      activeChatSubjectRef.current = row.subject;
      setSubjectChatLoading(true);
      bumpSessionScope();
      resetChatUiForScopeChange();
      setSubject(row.subject);
      setSelectedDate(row.session_date);
      setActiveSessionSlug(row.session_slug);
      if (user?.id) {
        void qc.invalidateQueries({
          queryKey: ["review-messages", user.id, row.session_slug, row.subject],
        });
      }
    },
    [bumpSessionScope, resetChatUiForScopeChange, user?.id, qc],
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

  const pinSummaryCardScope = useCallback(
    (scopeSubject: string, sessionDate: string, sessionSlug: string) => {
      summaryCardScopeRef.current = {
        subject: scopeSubject,
        sessionDate,
        sessionSlug,
      };
    },
    [],
  );

  /** Clear summary only when leaving the pinned session scope (not when submit finishes). */
  useEffect(() => {
    const pinned = summaryCardScopeRef.current;
    if (!pinned) return;

    const scopeSubject = onboardingIncomplete ? ONBOARDING_REVIEW_SUBJECT : subject;
    const sameScope =
      pinned.subject === scopeSubject &&
      pinned.sessionDate === selectedDate &&
      pinned.sessionSlug === activeSessionSlug;

    if (sameScope) return;

    summaryCardScopeRef.current = null;
    setSessionCard(null);
  }, [subject, selectedDate, activeSessionSlug, onboardingIncomplete]);

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
        const byKey = new Map<
          string,
          { session_slug: string; session_date: string; subject: string; started_at: string }
        >();
        const indexKey = (slug: string, subj: string) => `${slug}\0${subj}`;
        for (const row of data ?? []) {
          const sl = row.review_session_slug;
          const d = row.review_session_date;
          const subj = row.review_subject;
          const ca = row.created_at;
          if (!sl || !d || !subj || !ca) continue;
          const k = indexKey(sl, subj);
          const prev = byKey.get(k);
          if (!prev) {
            byKey.set(k, { session_slug: sl, session_date: d, subject: subj, started_at: ca });
          } else {
            byKey.set(k, { ...prev, session_date: d });
          }
        }
        const { data: summaryRows, error: sumErr } = await supabase
          .from("review_summaries")
          .select("review_session_slug,session_date,subject,created_at")
          .eq("user_id", user!.id)
          .not("review_session_slug", "is", null);
        if (sumErr) {
          console.warn("[review-sessions-index] summaries", sumErr);
        } else {
          for (const sum of summaryRows ?? []) {
            const sl = sum.review_session_slug;
            const subj = sum.subject;
            if (!sl || !subj) continue;
            const k = indexKey(sl, subj);
            const prev = byKey.get(k);
            byKey.set(k, {
              session_slug: sl,
              session_date: sum.session_date ?? prev?.session_date ?? localYmd(),
              subject: subj,
              started_at: prev?.started_at ?? sum.created_at,
            });
          }
        }
        const list: SessionRow[] = [...byKey.values()];
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
      const requestedSubject = chatSubject;
      try {
        const { data, error } = await supabase
          .from("coach_messages")
          .select("id,role,content,created_at,review_session_slug,review_subject")
          .eq("user_id", user!.id)
          .eq("review_session_slug", slug)
          .eq("review_subject", requestedSubject)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true });
        if (activeChatSubjectRef.current !== requestedSubject) {
          return [];
        }
        if (error) {
          console.warn("[review-messages]", error);
          return [];
        }
        const rows = (data ?? []) as CoachMessageRow[];
        const filtered = filterCoachMessagesForSession(rows, slug, requestedSubject);
        if (activeChatSubjectRef.current !== requestedSubject) {
          return [];
        }
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

  const cachedSubjectChat = chatsBySubject.current[subject];
  const hasCachedMessages =
    cachedSubjectChat?.activeSessionSlug === activeSessionSlug &&
    (cachedSubjectChat?.messages.length ?? 0) > 0;

  const showHistorySkeleton =
    subjectChatLoading ||
    (!msgSkeletonDeadline &&
      !!activeSessionSlug &&
      (messagesPending || messagesFetching) &&
      messageRows.length === 0 &&
      !hasCachedMessages);

  const messages: SageChatMessage[] = useMemo(() => {
    if (subjectChatLoading || subject !== activeChatSubjectRef.current) {
      return [];
    }
    const fromRows = messageRows
      .filter((m): m is CoachMessageRow => typeof m.id === "string")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        photoUploaded:
          m.role === "user" && isPhotoOnlyMessageContent(m.content) ? true : undefined,
      }));
    if (fromRows.length > 0) return fromRows;
    const cached = chatsBySubject.current[subject];
    if (
      cached?.activeSessionSlug === activeSessionSlug &&
      cached.messages.length > 0 &&
      !subjectChatLoading
    ) {
      return cached.messages;
    }
    return fromRows;
  }, [messageRows, subject, activeSessionSlug, subjectChatLoading]);

  useEffect(() => {
    if (!subjectChatLoading) return;
    if (subject !== activeChatSubjectRef.current) return;
    if (!activeSessionSlug) return;
    if (messagesPending || messagesFetching) return;
    setSubjectChatLoading(false);
  }, [
    subjectChatLoading,
    subject,
    activeSessionSlug,
    messagesPending,
    messagesFetching,
  ]);

  const userMessageCount = useMemo(
    () => messageRows.filter((m) => m.role === "user").length,
    [messageRows],
  );

  useEffect(() => {
    if (onboardingIncomplete) return;
    chatsBySubject.current[subject] = {
      messages: stripPhotoImagesFromMessages(messages),
      messageRows,
      activeSessionSlug,
      selectedDate,
      sessionCard,
    };
  }, [messages, messageRows, activeSessionSlug, selectedDate, subject, onboardingIncomplete, sessionCard]);

  /** Save current subject chat, restore cached session/messages for the next subject. */
  const switchSubject = useCallback(
    (nextSubject: string) => {
      if (onboardingIncomplete || nextSubject === subject) return;

      activeChatSubjectRef.current = nextSubject;
      setSubjectChatLoading(true);
      bumpSessionScope();

      summaryCardScopeRef.current = null;
      setSessionCard(null);

      chatsBySubject.current[subject] = subjectsWithEndedReview.has(subject)
        ? emptySubjectChatCache()
        : {
            messages: stripPhotoImagesFromMessages(messages),
            messageRows,
            activeSessionSlug,
            selectedDate,
            sessionCard,
          };

      const returningAfterEndedReview = subjectsWithEndedReview.has(nextSubject);
      if (returningAfterEndedReview) {
        const freshSlug = crypto.randomUUID();
        const today = localYmd();
        resetChatUiForScopeChange();
        summaryCardScopeRef.current = null;
        setSessionCard(null);
        chatsBySubject.current[nextSubject] = {
          messages: [],
          messageRows: [],
          activeSessionSlug: freshSlug,
          selectedDate: today,
          sessionCard: null,
        };
        setSubjectsWithEndedReview((prev) => {
          const next = new Set(prev);
          next.delete(nextSubject);
          return next;
        });
        skipSubjectScopeEffectRef.current = true;
        setSubject(nextSubject);
        setSelectedDate(today);
        setActiveSessionSlug(freshSlug);
        if (user?.id) {
          void qc.invalidateQueries({
            queryKey: ["review-messages", user.id, freshSlug, nextSubject],
          });
        }
        return;
      }

      const cached = chatsBySubject.current[nextSubject] ?? emptySubjectChatCache();
      let slug = cached.activeSessionSlug;
      let date = cached.selectedDate;
      if (!slug) {
        const latest = sessionIndex.find((s) => s.subject === nextSubject);
        if (latest) {
          slug = latest.session_slug;
          date = latest.session_date;
        }
      }

      skipSubjectScopeEffectRef.current = true;
      resetChatUiForScopeChange();
      setSubject(nextSubject);
      setSelectedDate(date);
      setActiveSessionSlug(slug);

      if (user?.id && slug) {
        void qc.invalidateQueries({
          queryKey: ["review-messages", user.id, slug, nextSubject],
        });
      }

      if (cached.sessionCard && cached.activeSessionSlug === slug) {
        setSessionCard(cached.sessionCard);
        if (cached.activeSessionSlug) {
          pinSummaryCardScope(nextSubject, date, cached.activeSessionSlug);
        }
      }
    },
    [
      subject,
      messages,
      messageRows,
      activeSessionSlug,
      selectedDate,
      sessionCard,
      sessionIndex,
      bumpSessionScope,
      resetChatUiForScopeChange,
      onboardingIncomplete,
      subjectsWithEndedReview,
      pinSummaryCardScope,
      user?.id,
      qc,
    ],
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

  const drawerSessionGroups = useMemo(
    () => groupSessionsForDrawer(sessionIndex),
    [sessionIndex],
  );

  const clearSummaryStreamTimeout = useCallback(() => {
    if (summaryStreamTimeoutRef.current) {
      clearTimeout(summaryStreamTimeoutRef.current);
      summaryStreamTimeoutRef.current = null;
    }
  }, []);

  const runSilentSummary = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    if (!user?.id || !activeSessionSlug) {
      setIsSummarySubmitting(false);
      setIsEndingReview(false);
      return;
    }
    if (summaryInFlightRef.current) return;
    const key = activeSessionSlug;
    if (summaryDoneKeysRef.current.has(key)) return;

    summaryInFlightRef.current = true;
    const summarySlug = activeSessionSlug;
    const summarySubject = chatSubject;
    const summaryGen = slugResolveGenRef.current;

    const failSummary = (message: string) => {
      clearSummaryStreamTimeout();
      summaryDoneKeysRef.current.delete(key);
      summaryCardScopeRef.current = null;
      setSubjectsWithEndedReview((prev) => {
        const next = new Set(prev);
        next.delete(summarySubject);
        return next;
      });
      setSessionCard({ kind: "error", message });
    };

    try {
      const existing = await findExistingReviewSummary(summarySlug, supabase);
      if (existing) {
        console.log("[review-summary] loaded existing summary for session", {
          sessionSlug: summarySlug,
          subject: existing.subject,
        });
        summaryDoneKeysRef.current.add(key);
        setSessionCard({
          kind: "full",
          subject: existing.subject,
          weak_point: existing.weak_point,
          tonight_task: existing.tonight_task,
          follow_up: existing.follow_up,
          mastered: existing.mastered,
        });
        pinSummaryCardScope(summarySubject, selectedDate, summarySlug);
        setSubjectsWithEndedReview((prev) => new Set(prev).add(summarySubject));
        return;
      }

      const { data: histRows, error: histErr } = await supabase
        .from("coach_messages")
        .select("role,content,review_session_slug,review_subject")
        .eq("user_id", user.id)
        .eq("review_session_slug", summarySlug)
        .eq("review_subject", summarySubject)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (histErr) {
        console.error("[review-summary] history fetch failed", histErr);
        failSummary("生成失败，点击重试");
        return;
      }
      if (slugResolveGenRef.current !== summaryGen) {
        failSummary("生成失败，点击重试");
        return;
      }

      const historyRows = filterCoachMessagesForSession(
        histRows ?? [],
        summarySlug,
        summarySubject,
      );

      const transcript = formatReviewConversationForSummary(historyRows);
      if (!transcript.trim()) {
        failSummary("生成失败，点击重试");
        return;
      }

      summaryDoneKeysRef.current.add(key);
      if (!background) {
        setSessionCard({ kind: "loading" });
      }

      clearSummaryStreamTimeout();
      summaryStreamTimeoutRef.current = setTimeout(() => {
        console.warn("[review-summary] stream timeout", { sessionSlug: summarySlug });
        failSummary("生成失败，点击重试");
      }, SUMMARY_STREAM_TIMEOUT_MS);

      const wasGuidedFirst = onboardingIncomplete;

      if (import.meta.env.DEV) {
        console.log("[review-summary] runSilentSummary", {
          key,
          summarySubject,
          messageCount: historyRows.length,
          transcriptChars: transcript.length,
        });
      }

      let summaryStreamRaf = 0;
      let pendingSummaryStream = "";
      let streamStarted = false;
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
          if (!streamStarted) {
            streamStarted = true;
            clearSummaryStreamTimeout();
          }
          pendingSummaryStream = full;
          if (!summaryStreamRaf) {
            summaryStreamRaf = requestAnimationFrame(flushSummaryStreamToUi);
          }
        },
      });
      clearSummaryStreamTimeout();
      if (summaryStreamRaf) cancelAnimationFrame(summaryStreamRaf);
      if (pendingSummaryStream) {
        const partial = parsePartialReviewSummaryStream(pendingSummaryStream);
        setSessionCard({
          kind: "streaming",
          subject: partial.subject,
          weak_point: partial.weak_point,
          tonight_task: partial.tonight_task,
          follow_up: partial.follow_up,
          mastered: partial.mastered,
        });
      }
      if (!parsed) throw new Error("parse");

      const row = buildReviewSummaryInsertRow({
        userId: user.id,
        sessionDate: selectedDate,
        subject: summarySubject,
        parsed,
        reviewSessionSlug: summarySlug,
      });
      const { id: summaryId } = await persistReviewSummary(row, supabase);
      console.log("[review-summary] saved", {
        id: summaryId,
        sessionSlug: summarySlug,
        subject: summarySubject,
      });

      setSessionCard({
        kind: "full",
        subject: summarySubject,
        weak_point: parsed.weak_point,
        tonight_task: parsed.tonight_task,
        follow_up: parsed.follow_up,
        mastered: parsed.mastered,
      });
      pinSummaryCardScope(summarySubject, selectedDate, summarySlug);

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ review_onboarding_complete: true })
        .eq("id", user.id);
      if (profileErr) console.error(profileErr);

      const closingContent = wasGuidedFirst
        ? POST_FIRST_ONBOARDING_SESSION_CLOSING
        : POST_REVIEW_SESSION_CLOSING;
      const alreadyHasClosing = historyRows.some(
        (m) => m.role === "assistant" && m.content === closingContent,
      );
      if (!alreadyHasClosing) {
        const { error: closingErr } = await supabase.from("coach_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: closingContent,
          review_subject: summarySubject,
          review_session_date: selectedDate,
          review_session_slug: summarySlug,
        });
        if (closingErr) console.error("[review-summary] closing message insert", closingErr);
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-summaries", user.id] }),
        qc.invalidateQueries({ queryKey: ["weak-point-archive", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-tasks", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-daily-progress", user.id] }),
        qc.invalidateQueries({ queryKey: ["today-sage-hook", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] }),
        qc.invalidateQueries({
          queryKey: ["review-messages", user.id, summarySlug, summarySubject],
        }),
        qc.invalidateQueries({ queryKey: ["profile-flags", user.id] }),
        qc.invalidateQueries({ queryKey: ["review-summary-meta", user.id] }),
      ]);
      window.dispatchEvent(new CustomEvent("sage-weak-archive-refresh"));

      await qc.refetchQueries({ queryKey: ["review-sessions-index", user.id] });
      const indexAfter = qc.getQueryData<SessionRow[]>(["review-sessions-index", user.id]);
      console.log("[review-summary] session index after save", {
        subject: summarySubject,
        sessionSlug: summarySlug,
        totalSessions: indexAfter?.length ?? 0,
        mathSessions: indexAfter?.filter((s) => s.subject === "数学").length ?? 0,
      });

      if (!wasGuidedFirst) {
        setSubjectsWithEndedReview((prev) => new Set(prev).add(summarySubject));
      }
    } catch (e) {
      summaryDoneKeysRef.current.delete(key);
      const pg = e as PostgrestError;
      if (pg?.code && pg?.message) {
        logSupabaseError("review-summary runSilentSummary", pg, { key });
      } else {
        console.error("[review-summary] runSilentSummary failed", {
          key,
          message: e instanceof Error ? e.message : String(e),
          error: e,
        });
      }
      failSummary("生成失败，点击重试");
    } finally {
      summaryInFlightRef.current = false;
      clearSummaryStreamTimeout();
      setIsSummarySubmitting(false);
      setIsEndingReview(false);
    }
  }, [
    chatSubject,
    selectedDate,
    user,
    qc,
    onboardingIncomplete,
    activeSessionSlug,
    clearSummaryStreamTimeout,
    pinSummaryCardScope,
  ]);

  const send = useCallback(async () => {
    const imageSnapshot = pendingImage;
    const text = draft.trim();
    const userText = text || (imageSnapshot ? "请帮我分析这道题目" : "");
    if (!userText || !user?.id || isSending) return;

    if (imageSnapshot) {
      setPhotoAnalysisLoading(true);
      setStreamingPhotoMarkdown(null);
      setStreamAssistantText(null);
    }

    const sendGen = slugResolveGenRef.current;
    const scopeSubject = chatSubject;
    const scopeDate = selectedDate;

    sendAbortRef.current?.abort();
    const abortController = new AbortController();
    sendAbortRef.current = abortController;

    setIsSending(true);
    setChatRetrying(false);
    setStreamingPhotoMarkdown(null);
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

      let photoDataUrl: string | null = null;
      if (imageSnapshot) {
        try {
          photoDataUrl = await compressImageToDataUrl(imageSnapshot.file);
        } catch (compressErr) {
          setStreamingPhotoMarkdown(null);
          setPhotoAnalysisLoading(false);
          toast.error(
            compressErr instanceof Error ? compressErr.message : "图片处理失败",
          );
          if (text) setDraft(text);
          return;
        }
        handleClearImage();
      }

      const userMessageContent = imageSnapshot && !text ? SAGE_PHOTO_MESSAGE_MARKER : userText;

      const { data: userRow, error: uErr } = await supabase
        .from("coach_messages")
        .insert({
          user_id: user.id,
          role: "user",
          content: userMessageContent,
          review_subject: scopeSubject,
          review_session_date: scopeDate,
          review_session_slug: sessionSlug,
        })
        .select("id")
        .single();
      if (uErr) throw uErr;

      setDraft("");
      clearedDraft = true;

      if (scopeStale()) return;

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      await qc.invalidateQueries({
        queryKey: ["review-messages", user.id, sessionSlug, scopeSubject],
      });

      if (imageSnapshot && photoDataUrl) {
        if (scopeStale()) return;

        let streamRaf = 0;
        let pendingMarkdown = "";
        const flushStreamToUi = () => {
          streamRaf = 0;
          if (scopeStale()) return;
          setStreamingPhotoMarkdown(pendingMarkdown);
        };

        let markdown: string;
        try {
          markdown = await analyzeQuestionPhoto(photoDataUrl, userText, {
            signal: abortController.signal,
            onDelta: (accumulated) => {
              pendingMarkdown = normalizePhotoMarkdown(accumulated);
              if (!streamRaf) {
                streamRaf = requestAnimationFrame(flushStreamToUi);
              }
            },
          });
          if (streamRaf) cancelAnimationFrame(streamRaf);
        } catch (photoErr) {
          if (streamRaf) cancelAnimationFrame(streamRaf);
          setStreamingPhotoMarkdown(null);
          setPhotoAnalysisLoading(false);
          if (scopeStale() || (photoErr instanceof DOMException && photoErr.name === "AbortError")) {
            return;
          }
          toast.error(
            photoErr instanceof Error ? photoErr.message : "题目识别失败",
          );
          if (text) setDraft(text);
          return;
        }

        if (scopeStale()) return;

        setStreamingPhotoMarkdown(markdown);

        const reply = wrapPhotoMarkdown(markdown);
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

        await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
        await qc.invalidateQueries({
          queryKey: ["review-messages", user.id, sessionSlug, scopeSubject],
        });
        setStreamingPhotoMarkdown(null);
        setPhotoAnalysisLoading(false);
        return;
      }

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
        if (text) setDraft(text);
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

      const userTurns = historyForApi.filter((m) => m.role === "user").length;
      if (
        isReviewWrapUpMessage(reply) &&
        userTurns >= 3 &&
        !subjectsWithEndedReview.has(scopeSubject)
      ) {
        void runSilentSummary({ background: true });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (scopeStale()) return;
      if (clearedDraft && text) setDraft(text);
      const msg = e instanceof Error ? e.message : "发送失败";
      toast.error(msg);
    } finally {
      setStreamAssistantText(null);
      setStreamingPhotoMarkdown(null);
      setPhotoAnalysisLoading(false);
      setChatRetrying(false);
      setIsSending(false);
      slugNavSourceRef.current = "control";
    }
  }, [
    draft,
    pendingImage,
    user?.id,
    isSending,
    chatSubject,
    selectedDate,
    qc,
    onboardingIncomplete,
    sprintMode,
    activeSessionSlug,
    bumpSessionScope,
    runSilentSummary,
    subjectsWithEndedReview,
    handleClearImage,
  ]);

  const prefetchSummary = useCallback(() => {
    if (userMessageCount < 3 || onboardingIncomplete) return;
    if (!activeSessionSlug || subjectsWithEndedReview.has(chatSubject)) return;
    if (summaryDoneKeysRef.current.has(activeSessionSlug) || summaryInFlightRef.current) {
      return;
    }
    void runSilentSummary({ background: true });
  }, [
    userMessageCount,
    onboardingIncomplete,
    activeSessionSlug,
    subjectsWithEndedReview,
    chatSubject,
    runSilentSummary,
  ]);

  const onEndReviewClick = useCallback(() => {
    if (userMessageCount < 3 || subjectsWithEndedReview.has(chatSubject)) {
      return;
    }
    if (!activeSessionSlug) return;

    setSubjectsWithEndedReview((prev) => new Set(prev).add(chatSubject));

    if (summaryDoneKeysRef.current.has(activeSessionSlug)) {
      if (sessionCard?.kind !== "full" && sessionCard?.kind !== "streaming") {
        setSessionCard({ kind: "loading" });
      }
      setIsSummarySubmitting(summaryInFlightRef.current);
      setIsEndingReview(summaryInFlightRef.current);
      return;
    }

    if (summaryInFlightRef.current) {
      setIsSummarySubmitting(true);
      setIsEndingReview(true);
      if (sessionCard?.kind !== "streaming" && sessionCard?.kind !== "full") {
        setSessionCard({ kind: "loading" });
      }
      return;
    }

    setIsSummarySubmitting(true);
    setIsEndingReview(true);
    setSessionCard({ kind: "loading" });
    void runSilentSummary();
  }, [
    userMessageCount,
    runSilentSummary,
    subjectsWithEndedReview,
    chatSubject,
    activeSessionSlug,
    sessionCard?.kind,
  ]);

  const onRetrySummary = useCallback(() => {
    if (!activeSessionSlug || isSummarySubmitting || summaryInFlightRef.current) return;
    summaryDoneKeysRef.current.delete(activeSessionSlug);
    setSubjectsWithEndedReview((prev) => {
      const next = new Set(prev);
      next.delete(chatSubject);
      return next;
    });
    setIsSummarySubmitting(true);
    setIsEndingReview(true);
    setSessionCard({ kind: "loading" });
    void runSilentSummary();
  }, [activeSessionSlug, isSummarySubmitting, runSilentSummary, chatSubject]);

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

  const showEndReviewButton =
    userMessageCount >= 3 &&
    !subjectsWithEndedReview.has(chatSubject) &&
    !isSummarySubmitting;

  const summaryBelow =
    sessionCard?.kind === "loading" ? (
      <ReviewSummaryCard variant="skeleton" />
    ) : sessionCard?.kind === "error" ? (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="text-destructive">{sessionCard.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full rounded-xl"
          onClick={onRetrySummary}
        >
          重试
        </Button>
      </div>
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

  const renderChatPanel = (layout: "default" | "mobile") => (
    <SageChatPanel
      layout={layout}
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
      composerHint={chatRetrying ? "重试中…" : null}
      onWrapUpDetected={prefetchSummary}
      pendingImage={pendingImage}
      onImageSelected={handleImageSelected}
      onClearImage={handleClearImage}
      photoAnalysisLoading={photoAnalysisLoading}
      streamingPhotoMarkdown={streamingPhotoMarkdown}
      betweenScrollAndInput={
        showEndReviewButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-xl border-dashed"
            disabled={isSummarySubmitting}
            onClick={onEndReviewClick}
          >
            {isSummarySubmitting ? "生成中..." : "结束复盘"}
          </Button>
        ) : null
      }
      belowForm={summaryBelow}
    />
  );

  const pickSessionFromDrawer = (row: SessionRow) => {
    loadSessionFromPicker(row);
    setDrawerOpen(false);
  };

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/app/review/archive") {
    return <Outlet />;
  }

  return (
    <>
      <div className="fixed inset-0 z-30 flex h-screen max-h-screen flex-col overflow-hidden bg-background lg:hidden">
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-lg leading-none text-foreground"
            aria-label="打开复盘历史"
          >
            ☰
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium text-foreground">
            {chatSubject}复盘
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/app/diagnostic"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              诊断
            </Link>
            <Link
              to="/app/review/archive"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              弱点档案
            </Link>
          </div>
        </div>

        {!onboardingIncomplete && (
          <div className="scrollbar-hide flex h-10 shrink-0 items-center gap-2 overflow-x-auto px-4">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => switchSubject(s)}
                className={cn(
                  "shrink-0 rounded-[20px] border px-[14px] py-[5px] text-xs font-medium leading-none transition",
                  subject === s
                    ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                    : "border-border bg-white text-muted-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {renderChatPanel("mobile")}

        {drawerOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="关闭复盘历史"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}
        <div
          className={cn(
            "fixed left-0 top-0 z-50 flex h-full w-[78%] max-w-sm flex-col bg-white shadow-xl transition-transform duration-200 ease-out",
            drawerOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <h2 className="text-base font-semibold">复盘历史</h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-muted"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 [-webkit-overflow-scrolling:touch]">
            {drawerSessionGroups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无复盘记录</p>
            ) : (
              drawerSessionGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="mb-2 px-4 text-xs font-medium text-muted-foreground">{group.label}</p>
                  <ul className="space-y-0 divide-y divide-border border-y border-border">
                    {group.rows.map((row) => {
                      const tag =
                        MOBILE_SUBJECT_TAG_STYLES[row.subject] ?? MOBILE_SUBJECT_TAG_STYLES["地理"];
                      const active = activeSessionSlug === row.session_slug;
                      return (
                        <li key={row.session_slug}>
                          <button
                            type="button"
                            onClick={() => pickSessionFromDrawer(row)}
                            className={cn(
                              "w-full border-0 border-b border-border bg-white py-3 pl-5 pr-4 text-left transition last:border-b-0",
                              subjectAccentTaskClass(row.subject),
                              active ? "bg-primary/5" : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: tag.bg, color: tag.color }}
                              >
                                {row.subject}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {formatSessionTime(row.started_at)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm tabular-nums text-muted-foreground">
                              {formatSessionDateTimeLabel(row.session_date, row.started_at)}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="hidden h-full min-h-0 flex-1 flex-col overflow-hidden lg:flex">
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {renderChatPanel("default")}
          </div>
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
    </>
  );
}
