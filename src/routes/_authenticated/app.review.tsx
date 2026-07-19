import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import { isSubjectSearch } from "@/lib/wiki-app-nav";
import { createSafeStorage } from "@/lib/safe-storage";
import { buildReviewDeepSeekSystemPrompt } from "@/lib/sage-system-prompt";
import { filterCoachMessagesForSession } from "@/lib/review-session-messages";
import { fetchUserExams, pickNearestExam } from "@/lib/user-exams";
import { invokeDeepSeekChat, getDeepSeekUserMessage, isRetryableNetworkFailure } from "@/lib/deepseek-supabase";
import { recordProductAnalyticsEvent } from "@/lib/analytics/api";
import { SageChatPanel, type SageChatMessage, type SageChatPanelHandle } from "@/components/sage-chat-panel";
import { ReviewSummaryCard } from "@/components/review-summary-card";
import {
  MAX_PENDING_CHAT_IMAGES,
  revokePendingChatImage,
  revokePendingChatImages,
  type PendingChatImage,
} from "@/components/chat-image-picker";
import { compressImageToDataUrl } from "@/lib/image-compress";
import {
  analyzeQuestionPhoto,
  normalizePhotoMarkdown,
  SAGE_PHOTO_MD_MARKER,
  sanitizePhotoMarkdownForDisplay,
  stripPhotoContentForChatApi,
  unwrapPhotoMarkdown,
  wrapPhotoMarkdown,
} from "@/lib/question-photo-analysis";
import { isPhotoQuizRevealRequest } from "@/lib/photo-quiz-parse";
import { ingestPhotoEvidence } from "@/lib/knowledge-tracking/ingest-client";
import {
  buildKnowledgeRemediationFromExtractionAsync,
  fetchPhotoRemediationsForMessages,
  type KnowledgeRemediation,
} from "@/lib/knowledge-topics/recommend";
import {
  fetchRemediationProgressMap,
  recordPhotoRemediationProgress,
  type RemediationAction,
  type RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";
import {
  isPhotoOnlyMessageContent,
  SAGE_PHOTO_MESSAGE_MARKER,
  stripPhotoImagesFromMessages,
} from "@/lib/review-photo-messages";
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
import { MoreHorizontal, Plus } from "lucide-react";
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
import {
  clearReviewDailySession,
  setReviewDailySession,
} from "@/lib/review-daily-session";
import { resolveReviewSessionSlug } from "@/lib/review-session-resolve";
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

function coachRowsToChatMessages(rows: CoachMessageRow[]): SageChatMessage[] {
  return rows
    .filter((m): m is CoachMessageRow => typeof m.id === "string")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      photoUploaded:
        m.role === "user" && isPhotoOnlyMessageContent(m.content) ? true : undefined,
    }));
}

export const Route = createFileRoute("/_authenticated/app/review")({
  validateSearch: (raw) => {
    const parsed = z.object({ subject: z.string().optional() }).parse(raw);
    return {
      subject: isSubjectSearch(parsed.subject) ? parsed.subject : undefined,
    };
  },
  component: Review,
});

const lastReviewSubjectStore = createSafeStorage(
  typeof localStorage !== "undefined" ? localStorage : undefined,
);
const LAST_REVIEW_SUBJECT_KEY = "sage:last-review-subject";

function resolveDefaultReviewSubject(): Subject {
  const stored = lastReviewSubjectStore.getItem(LAST_REVIEW_SUBJECT_KEY);
  if (stored && isSubjectSearch(stored)) return stored;
  return SUBJECTS[0];
}

function cachedSessionSlugForToday(
  cachedSlug: string | null,
  cachedDate: string,
): string | null {
  const today = localYmd();
  if (cachedSlug && cachedDate === today) return cachedSlug;
  return null;
}

function persistDailySession(subject: string, slug: string | null) {
  if (!slug) return;
  setReviewDailySession(subject, localYmd(), slug, lastReviewSubjectStore);
}

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** e.g. 5月14日 20:30 — subject-scoped history list. */
function formatSessionListLabel(sessionDate: string, startedAtIso: string) {
  const [, mo, da] = sessionDate.split("-").map(Number);
  return `${mo}月${da}日 ${formatSessionTime(startedAtIso)}`;
}

const SESSION_PREVIEW_MAX = 72;

function truncateSessionPreview(text: string, max = SESSION_PREVIEW_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function messagePreviewFromContent(content: string): string | null {
  if (isPhotoOnlyMessageContent(content)) return "上传了题目图片";
  let t = content;
  if (t.includes(SAGE_PHOTO_MESSAGE_MARKER)) {
    t = t.split(SAGE_PHOTO_MESSAGE_MARKER)[0]?.trim() ?? t;
  }
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return truncateSessionPreview(t);
}

function sessionListPreview(row: SessionRow): string {
  if (row.tonight_task?.trim()) return row.tonight_task.trim();
  if (row.weak_point?.trim()) return row.weak_point.trim();
  if (row.message_preview?.trim()) return row.message_preview.trim();
  return "复盘进行中，尚未整理今晚任务";
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
  weak_point?: string | null;
  tonight_task?: string | null;
  message_preview?: string | null;
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

/** Stable key for subject + session scope; guards all async message/summary writes. */
function reviewScopeKey(subject: string, slug: string | null): string {
  return `${subject}\0${slug ?? ""}`;
}

function Review() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { subject: urlSubject } = Route.useSearch();
  const qc = useQueryClient();
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [selectedDate, setSelectedDate] = useState(() => localYmd());
  const chatPanelRef = useRef<SageChatPanelHandle>(null);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [streamingPhotoMarkdown, setStreamingPhotoMarkdown] = useState<string | null>(null);
  const [photoAnalysisLoading, setPhotoAnalysisLoading] = useState(false);
  const [photoRemediationByMessageId, setPhotoRemediationByMessageId] = useState<
    Record<string, KnowledgeRemediation>
  >({});
  const [photoRemediationProgressByMessageId, setPhotoRemediationProgressByMessageId] =
    useState<Record<string, RemediationProgress>>({});
  const [messages, setMessages] = useState<SageChatMessage[]>([]);
  const [chatScopeKey, setChatScopeKey] = useState(() => reviewScopeKey(SUBJECTS[0], null));
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

  const [activeSessionSlug, setActiveSessionSlugState] = useState<string | null>(null);
  const [chatRetrying, setChatRetrying] = useState(false);
  const [deleteDialogSession, setDeleteDialogSession] = useState<SessionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slugNavSourceRef = useRef<"control" | "sidebar" | "plus" | "opening">("control");
  const sendAbortRef = useRef<AbortController | null>(null);
  /** When true, the next subject-driven effect must not clear session (sidebar / session picker just set subject+date+slug). */
  const preserveSessionFromPickerRef = useRef(false);
  const skipSubjectScopeEffectRef = useRef(false);
  const chatsBySubject = useRef<Record<string, SubjectChatCache>>(createChatsBySubject());
  /** messages 与 summary 共用：切换科目/场次时第一步更新，异步写入前必须校验。 */
  const activeKeyRef = useRef(reviewScopeKey(subject, null));
  /** Bumped on scope change so in-flight loadHistory calls cannot repopulate stale chat. */
  const historyLoadSeqRef = useRef(0);

  /** When true, DB rows must not repopulate chat (e.g. after「结束复盘」). */
  const suppressChatMessagesSyncRef = useRef(false);

  const [messageRows, setMessageRows] = useState<CoachMessageRow[]>([]);
  const [historyFetching, setHistoryFetching] = useState(false);

  const applyActiveSessionSlug = useCallback((slug: string | null) => {
    setActiveSessionSlugState(slug);
    if (slug) persistDailySession(subjectRef.current, slug);
  }, []);

  const beginReviewScope = useCallback((newSubject: string, slug: string | null) => {
    historyLoadSeqRef.current += 1;
    const newKey = reviewScopeKey(newSubject, slug);
    activeKeyRef.current = newKey;
    setChatScopeKey(newKey);
    return newKey;
  }, []);

  /** 异步拉取历史；仅在 scope 未变时写入 messages。 */
  const loadHistory = useCallback(
    async (targetSubject: string, targetSlug: string | null) => {
      if (!user?.id || !targetSlug || suppressChatMessagesSyncRef.current) {
        setSubjectChatLoading(false);
        setHistoryFetching(false);
        return;
      }
      const targetKey = reviewScopeKey(targetSubject, targetSlug);
      const loadSeq = historyLoadSeqRef.current;
      setSubjectChatLoading(true);
      setHistoryFetching(true);
      try {
        const { data, error } = await supabase
          .from("coach_messages")
          .select("id,role,content,created_at,review_session_slug,review_subject")
          .eq("user_id", user.id)
          .eq("review_session_slug", targetSlug)
          .eq("review_subject", targetSubject)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true });
        if (loadSeq !== historyLoadSeqRef.current || activeKeyRef.current !== targetKey) return;
        if (error) {
          console.warn("[review-messages] loadHistory", error);
          return;
        }
        const filtered = filterCoachMessagesForSession(
          (data ?? []) as CoachMessageRow[],
          targetSlug,
          targetSubject,
        );
        const rows = filtered.map(({ id, role, content, created_at, review_session_slug }) => ({
          id,
          role,
          content,
          created_at,
          review_session_slug,
        }));
        setMessageRows(rows);
        setMessages(coachRowsToChatMessages(rows));

        const photoAssistantIds = rows
          .filter((r) => r.role === "assistant" && unwrapPhotoMarkdown(r.content).isPhotoAnalysis)
          .map((r) => r.id);
        if (photoAssistantIds.length > 0) {
          void Promise.all([
            fetchPhotoRemediationsForMessages(photoAssistantIds),
            fetchRemediationProgressMap(photoAssistantIds),
          ]).then(([remediationMap, progressMap]) => {
            if (loadSeq !== historyLoadSeqRef.current || activeKeyRef.current !== targetKey) return;
            if (Object.keys(remediationMap).length > 0) {
              setPhotoRemediationByMessageId((prev) => ({ ...prev, ...remediationMap }));
            }
            if (Object.keys(progressMap).length > 0) {
              setPhotoRemediationProgressByMessageId((prev) => ({ ...prev, ...progressMap }));
            }
          });
        }
      } catch (e) {
        console.warn("[review-messages] loadHistory", e);
      } finally {
        if (loadSeq === historyLoadSeqRef.current && activeKeyRef.current === targetKey) {
          setSubjectChatLoading(false);
          setHistoryFetching(false);
        }
      }
    },
    [user?.id],
  );

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

  const resetChatUiForScopeChange = useCallback(() => {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setStreamAssistantText(null);
    chatPanelRef.current?.clearInput();
    setPendingImages((prev) => {
      revokePendingChatImages(prev);
      return [];
    });
    setStreamingPhotoMarkdown(null);
    setPhotoAnalysisLoading(false);
    setIsSending(false);
    setChatRetrying(false);
  }, []);

  const clearSummaryStreamTimeout = useCallback(() => {
    if (summaryStreamTimeoutRef.current) {
      clearTimeout(summaryStreamTimeoutRef.current);
      summaryStreamTimeoutRef.current = null;
    }
  }, []);

  /** 切换科目/场次后的其余 UI 重置（messages/summary 由 handleSubjectChange 同步清空）。 */
  const clearSubjectScopedUi = useCallback(() => {
      suppressChatMessagesSyncRef.current = false;
      summaryCardScopeRef.current = null;
      clearSummaryStreamTimeout();
      sendAbortRef.current?.abort();
      sendAbortRef.current = null;
      setMessageRows([]);
      setSubjectChatLoading(true);
      setHistoryFetching(false);
      setIsSummarySubmitting(false);
      setIsEndingReview(false);
      setStreamAssistantText(null);
      chatPanelRef.current?.clearInput();
      setPendingImages((prev) => {
        revokePendingChatImages(prev);
        return [];
      });
      setStreamingPhotoMarkdown(null);
      setPhotoAnalysisLoading(false);
      setIsSending(false);
      setChatRetrying(false);
  }, [clearSummaryStreamTimeout]);

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

  /** 若该场次已有小结，异步加载；写入前校验 scope key 未变。 */
  const loadExistingSummary = useCallback(
    async (targetSubject: string, targetSlug: string | null, sessionDate: string) => {
      if (!user?.id || !targetSlug) return;
      const targetKey = reviewScopeKey(targetSubject, targetSlug);
      try {
        const existing = await findExistingReviewSummary(targetSlug, supabase);
        if (activeKeyRef.current !== targetKey) return;
        if (!existing) return;
        console.log("[review-summary] loaded existing summary for session", {
          sessionSlug: targetSlug,
          subject: existing.subject,
        });
        setSessionCard({
          kind: "full",
          subject: existing.subject,
          weak_point: existing.weak_point,
          tonight_task: existing.tonight_task,
          follow_up: existing.follow_up,
          mastered: existing.mastered,
        });
        pinSummaryCardScope(targetSubject, sessionDate, targetSlug);
        summaryDoneKeysRef.current.add(targetSlug);
        setSubjectsWithEndedReview((prev) => new Set(prev).add(targetSubject));
      } catch (e) {
        console.warn("[review-summary] loadExistingSummary", e);
      }
    },
    [user?.id, pinSummaryCardScope],
  );

  /** 切换科目/场次：同步更新 scope，清空或加载 messages/summary。 */
  const handleSubjectChange = useCallback(
    (newSubject: string, slug: string | null, date: string) => {
      beginReviewScope(newSubject, slug);
      setMessages([]);
      setSessionCard(null);
      clearSubjectScopedUi();
      setSubject(newSubject);
      setSelectedDate(date);
      applyActiveSessionSlug(slug);
      void loadHistory(newSubject, slug);
      void loadExistingSummary(newSubject, slug, date);
    },
    [
      beginReviewScope,
      clearSubjectScopedUi,
      applyActiveSessionSlug,
      loadHistory,
      loadExistingSummary,
    ],
  );

  const handleImagesSelected = useCallback((incoming: PendingChatImage[]) => {
    if (incoming.length === 0) return;
    setPendingImages((prev) => {
      const room = MAX_PENDING_CHAT_IMAGES - prev.length;
      if (room <= 0) {
        toast.message(`最多添加 ${MAX_PENDING_CHAT_IMAGES} 张图片`);
        revokePendingChatImages(incoming);
        return prev;
      }
      const toAdd = incoming.slice(0, room);
      if (incoming.length > room) {
        revokePendingChatImages(incoming.slice(room));
        toast.message(`最多 ${MAX_PENDING_CHAT_IMAGES} 张，已添加 ${toAdd.length} 张`);
      }
      return [...prev, ...toAdd];
    });
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((image) => image.id === id);
      revokePendingChatImage(target);
      return prev.filter((image) => image.id !== id);
    });
  }, []);

  const handleClearImages = useCallback(() => {
    setPendingImages((prev) => {
      revokePendingChatImages(prev);
      return [];
    });
  }, []);

  const clearCurrentSubjectChat = useCallback(() => {
    if (onboardingIncomplete) return;
    clearReviewDailySession(subject, lastReviewSubjectStore);
    chatsBySubject.current[subject] = emptySubjectChatCache();
    resetChatUiForScopeChange();
    handleSubjectChange(subject, null, localYmd());
  }, [
    subject,
    onboardingIncomplete,
    handleSubjectChange,
    resetChatUiForScopeChange,
  ]);

  const loadSessionFromPicker = useCallback(
    (row: { subject: string; session_date: string; session_slug: string }) => {
      preserveSessionFromPickerRef.current = true;
      slugNavSourceRef.current = "sidebar";
      resetChatUiForScopeChange();
      handleSubjectChange(row.subject, row.session_slug, row.session_date);
    },
    [handleSubjectChange, resetChatUiForScopeChange],
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
      applyActiveSessionSlug(null);
      const sub = ONBOARDING_REVIEW_SUBJECT;
      beginReviewScope(sub, null);
      setMessages([]);
      setSessionCard(null);
      setSubject(sub);
      setSelectedDate(localYmd());
    }
  }, [profileFlagsReady, profileFlags?.needsGuidedReviewOnboarding, applyActiveSessionSlug, beginReviewScope]);

  const prevSubjectForScopeRef = useRef(subject);

  useEffect(() => {
    if (onboardingIncomplete) return;
    if (prevSubjectForScopeRef.current === subject) return;
    prevSubjectForScopeRef.current = subject;
    if (preserveSessionFromPickerRef.current) {
      preserveSessionFromPickerRef.current = false;
      return;
    }
    if (skipSubjectScopeEffectRef.current) {
      skipSubjectScopeEffectRef.current = false;
      return;
    }
    resetChatUiForScopeChange();
    const today = localYmd();
    void resolveReviewSessionSlug(user?.id, subject, today, null, lastReviewSubjectStore).then(
      (slug) => {
        handleSubjectChange(subject, slug, today);
      },
    );
  }, [
    subject,
    onboardingIncomplete,
    user?.id,
    handleSubjectChange,
    resetChatUiForScopeChange,
  ]);

  /** Restore today's session when re-entering review (e.g. after switching tabs). */
  const reviewSessionBootstrappedRef = useRef(false);
  useEffect(() => {
    if (!profileFlagsReady || onboardingIncomplete || !user?.id || !urlSubject) return;
    if (reviewSessionBootstrappedRef.current) return;
    reviewSessionBootstrappedRef.current = true;

    const sub = urlSubject;
    const today = localYmd();
    void resolveReviewSessionSlug(user.id, sub, today, null, lastReviewSubjectStore).then(
      (slug) => {
        if (!slug) return;
        suppressChatMessagesSyncRef.current = false;
        skipSubjectScopeEffectRef.current = true;
        handleSubjectChange(sub, slug, today);
      },
    );
  }, [profileFlagsReady, onboardingIncomplete, urlSubject, user?.id, handleSubjectChange]);

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
      slugNavSourceRef.current = "opening";
      const openingSlug = crypto.randomUUID();
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["review-prior-any", uid] }),
        qc.invalidateQueries({ queryKey: ["review-sessions-index", uid] }),
      ]);
      handleSubjectChange(sub, openingSlug, dt);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, hasAnyReviewMessages, profileFlagsReady, onboardingIncomplete, qc, handleSubjectChange]);

  const { data: sessionIndex = [] } = useQuery({
    queryKey: ["review-sessions-index", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("coach_messages")
          .select("review_session_slug,review_session_date,review_subject,created_at,role,content")
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
          {
            session_slug: string;
            session_date: string;
            subject: string;
            started_at: string;
            weak_point?: string | null;
            tonight_task?: string | null;
            message_preview?: string | null;
          }
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
          if (row.role === "user" && row.content) {
            const preview = messagePreviewFromContent(row.content);
            if (preview) {
              const entry = byKey.get(k);
              if (entry) entry.message_preview = preview;
            }
          }
        }
        const { data: summaryRows, error: sumErr } = await supabase
          .from("review_summaries")
          .select("review_session_slug,session_date,subject,created_at,weak_point,tonight_task")
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
              weak_point: sum.weak_point,
              tonight_task: sum.tonight_task,
              message_preview: prev?.message_preview ?? null,
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

  /** Save current subject chat, restore in-memory session for the next subject (no auto-load from DB). */
  const switchSubject = useCallback(
    (nextSubject: string) => {
      if (onboardingIncomplete || nextSubject === subject) return;

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
        handleSubjectChange(nextSubject, freshSlug, today);
        return;
      }

      const cached = chatsBySubject.current[nextSubject] ?? emptySubjectChatCache();
      const date = localYmd();
      const cachedSlug = cachedSessionSlugForToday(
        cached.activeSessionSlug,
        cached.selectedDate,
      );

      skipSubjectScopeEffectRef.current = true;
      resetChatUiForScopeChange();

      void resolveReviewSessionSlug(
        user?.id,
        nextSubject,
        date,
        cachedSlug ? { slug: cachedSlug } : null,
        lastReviewSubjectStore,
      ).then((slug) => {
        beginReviewScope(nextSubject, slug);
        setMessages(cached.messages);
        setMessageRows(cached.messageRows);
        setSessionCard(cached.sessionCard);
        setSubject(nextSubject);
        setSelectedDate(date);
        applyActiveSessionSlug(slug);
        setSubjectChatLoading(Boolean(slug));
        setHistoryFetching(false);

        if (slug && !suppressChatMessagesSyncRef.current) {
          void loadHistory(nextSubject, slug);
        }
        if (slug) void loadExistingSummary(nextSubject, slug, date);
      });
    },
    [
      subject,
      messages,
      messageRows,
      activeSessionSlug,
      selectedDate,
      sessionCard,
      handleSubjectChange,
      resetChatUiForScopeChange,
      beginReviewScope,
      onboardingIncomplete,
      subjectsWithEndedReview,
      applyActiveSessionSlug,
      loadHistory,
      loadExistingSummary,
      user?.id,
    ],
  );

  const filteredSessionRows = useMemo(() => {
    return sessionIndex.filter((s) => s.subject === chatSubject);
  }, [sessionIndex, chatSubject]);

  const hasSessionForSelectedDate = useMemo(
    () => sessionIndex.some((s) => s.session_date === selectedDate && s.subject === chatSubject),
    [sessionIndex, selectedDate, chatSubject],
  );

  const showHistorySkeleton = subjectChatLoading || historyFetching;

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

  useEffect(() => {
    if (onboardingIncomplete || urlSubject) return;
    const fallback = resolveDefaultReviewSubject();
    void navigate({ to: "/app/review", search: { subject: fallback }, replace: true });
  }, [urlSubject, onboardingIncomplete, navigate]);

  useEffect(() => {
    if (onboardingIncomplete || !urlSubject || urlSubject === subject) return;
    switchSubject(urlSubject);
  }, [urlSubject, onboardingIncomplete, subject, switchSubject]);

  useEffect(() => {
    if (!urlSubject || onboardingIncomplete) return;
    lastReviewSubjectStore.setItem(LAST_REVIEW_SUBJECT_KEY, urlSubject);
  }, [urlSubject, onboardingIncomplete]);

  const pickReviewSubject = useCallback(
    (next: Subject) => {
      lastReviewSubjectStore.setItem(LAST_REVIEW_SUBJECT_KEY, next);
      void navigate({ to: "/app/review", search: { subject: next } });
    },
    [navigate],
  );

  const drawerSessionGroups = useMemo(
    () => groupSessionsForDrawer(sessionIndex),
    [sessionIndex],
  );

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
    const targetKey = reviewScopeKey(summarySubject, summarySlug);

    const applySessionCard = (card: SessionCardState) => {
      if (activeKeyRef.current !== targetKey) return;
      setSessionCard(card);
    };

    const failSummary = (message: string) => {
      if (activeKeyRef.current !== targetKey) return;
      clearSummaryStreamTimeout();
      summaryDoneKeysRef.current.delete(key);
      summaryCardScopeRef.current = null;
      setSubjectsWithEndedReview((prev) => {
        const next = new Set(prev);
        next.delete(summarySubject);
        return next;
      });
      applySessionCard({ kind: "error", message });
    };

    try {
      const existing = await findExistingReviewSummary(summarySlug, supabase);
      if (activeKeyRef.current !== targetKey) return;
      if (existing) {
        console.log("[review-summary] loaded existing summary for session", {
          sessionSlug: summarySlug,
          subject: existing.subject,
        });
        summaryDoneKeysRef.current.add(key);
        applySessionCard({
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
      if (activeKeyRef.current !== targetKey) return;

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
        applySessionCard({ kind: "loading" });
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
        applySessionCard({
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
        applySessionCard({
          kind: "streaming",
          subject: partial.subject,
          weak_point: partial.weak_point,
          tonight_task: partial.tonight_task,
          follow_up: partial.follow_up,
          mastered: partial.mastered,
        });
      }
      if (!parsed) throw new Error("parse");
      if (activeKeyRef.current !== targetKey) return;

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

      applySessionCard({
        kind: "full",
        subject: summarySubject,
        weak_point: parsed.weak_point,
        tonight_task: parsed.tonight_task,
        follow_up: parsed.follow_up,
        mastered: parsed.mastered,
      });
      if (activeKeyRef.current !== targetKey) return;
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

  const send = useCallback(async (draftText: string) => {
    const imageSnapshot = pendingImages;
    const text = draftText.trim();
    const userText =
      text ||
      (imageSnapshot.length > 0
        ? imageSnapshot.length > 1
          ? "请帮我分析这些题目"
          : "请帮我分析这道题目"
        : "");
    if (!userText || !user?.id || isSending) return;

    if (imageSnapshot.length === 0 && isPhotoQuizRevealRequest(userText)) {
      toast.message("请直接在巩固题上点击选项，系统会自动判分并显示解析。");
      return;
    }

    if (imageSnapshot.length > 0) {
      setPhotoAnalysisLoading(true);
      setStreamingPhotoMarkdown(null);
      setStreamAssistantText(null);
    }

    const scopeSubject = chatSubject;
    const scopeDate = selectedDate;

    sendAbortRef.current?.abort();
    const abortController = new AbortController();
    sendAbortRef.current = abortController;

    setIsSending(true);
    setChatRetrying(false);
    setStreamingPhotoMarkdown(null);
    let clearedDraft = false;

    let sessionSlug = activeSessionSlug;
    if (!sessionSlug) {
      sessionSlug = crypto.randomUUID();
      slugNavSourceRef.current = "plus";
      applyActiveSessionSlug(sessionSlug);
      beginReviewScope(scopeSubject, sessionSlug);
    }
    const targetKey = reviewScopeKey(scopeSubject, sessionSlug);
    const scopeStale = () => activeKeyRef.current !== targetKey;

    try {
      if (scopeStale()) return;

      let photoDataUrls: string[] = [];
      if (imageSnapshot.length > 0) {
        try {
          photoDataUrls = await Promise.all(
            imageSnapshot.map((image) => compressImageToDataUrl(image.file)),
          );
        } catch (compressErr) {
          setStreamingPhotoMarkdown(null);
          setPhotoAnalysisLoading(false);
          toast.error(
            compressErr instanceof Error ? compressErr.message : "图片处理失败",
          );
          if (text) chatPanelRef.current?.setInputValue(text);
          return;
        }
        handleClearImages();
      }

      const userMessageContent =
        imageSnapshot.length > 0 && !text ? SAGE_PHOTO_MESSAGE_MARKER : userText;

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

      chatPanelRef.current?.clearInput();
      clearedDraft = true;

      if (scopeStale()) return;

      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });

      if (imageSnapshot.length > 0 && photoDataUrls.length > 0) {
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
          markdown = await analyzeQuestionPhoto(photoDataUrls, userText, {
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
          void recordProductAnalyticsEvent("photo_analysis_failed", {
            subject: scopeSubject,
          });
          toast.error(
            photoErr instanceof Error ? photoErr.message : "题目识别失败",
          );
          if (text) chatPanelRef.current?.setInputValue(text);
          return;
        }

        if (scopeStale()) return;

        const displayMarkdown = sanitizePhotoMarkdownForDisplay(markdown);
        setStreamingPhotoMarkdown(displayMarkdown);

        const reply = wrapPhotoMarkdown(markdown);
        const { data: assistantRow, error: aErr } = await supabase
          .from("coach_messages")
          .insert({
            user_id: user.id,
            role: "assistant",
            content: reply,
            review_subject: scopeSubject,
            review_session_date: scopeDate,
            review_session_slug: sessionSlug,
          })
          .select("id, created_at")
          .single();
        if (aErr) throw aErr;

        if (scopeStale()) return;

        // 先写入本地消息再关掉流式气泡，减少「整段拆掉再挂上」的闪跳
        if (assistantRow?.id) {
          const localRow = {
            id: assistantRow.id as string,
            role: "assistant",
            content: reply,
            created_at:
              (assistantRow.created_at as string | undefined) ?? new Date().toISOString(),
          };
          setMessageRows((prev) =>
            prev.some((r) => r.id === localRow.id) ? prev : [...prev, localRow],
          );
          setMessages((prev) =>
            prev.some((m) => m.id === localRow.id)
              ? prev
              : [...prev, ...coachRowsToChatMessages([localRow])],
          );
          setStreamingPhotoMarkdown(null);
          setPhotoAnalysisLoading(false);

          void ingestPhotoEvidence({
            coach_message_id: assistantRow.id,
            subject: scopeSubject as import("@/lib/subjects").Subject,
            session_date: scopeDate,
            session_slug: sessionSlug,
            analysis_markdown: markdown,
          })
            .then(async (res) => {
              const remediation = await buildKnowledgeRemediationFromExtractionAsync(
                res.extraction,
              );
              if (remediation) {
                setPhotoRemediationByMessageId((prev) => ({
                  ...prev,
                  [assistantRow.id]: remediation,
                }));
              }
              const n = res.extraction.knowledge_points.length;
              if (n > 0) {
                toast.success(`已识点 ${n} 个，已同步到辅学；今晚任务已写入今日页`);
              }
            })
            .catch((e) => {
              console.warn("[knowledge-ingest]", e);
            });
        } else {
          setStreamingPhotoMarkdown(null);
          setPhotoAnalysisLoading(false);
        }

        await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
        if (!scopeStale()) {
          void loadHistory(scopeSubject, sessionSlug);
        }
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
          content: stripPhotoContentForChatApi(m.content),
        })),
      ];
      if (import.meta.env.DEV) {
        console.log("[review-send] DeepSeek request", {
          sessionSlug,
          reviewSubject: scopeSubject,
          targetKey,
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
            : getDeepSeekUserMessage(streamErr),
        );
        if (text) chatPanelRef.current?.setInputValue(text);
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
      setStreamAssistantText(null);
      if (!scopeStale()) void loadHistory(scopeSubject, sessionSlug);

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
      if (clearedDraft && text) chatPanelRef.current?.setInputValue(text);
      const msg = getDeepSeekUserMessage(e);
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
    pendingImages,
    user?.id,
    isSending,
    chatSubject,
    selectedDate,
    qc,
    onboardingIncomplete,
    sprintMode,
    activeSessionSlug,
    applyActiveSessionSlug,
    runSilentSummary,
    subjectsWithEndedReview,
    handleClearImages,
    loadHistory,
    beginReviewScope,
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

    setMessages([]);
    suppressChatMessagesSyncRef.current = true;
    clearReviewDailySession(chatSubject, lastReviewSubjectStore);
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
      clearReviewDailySession(subj, lastReviewSubjectStore);
      await qc.invalidateQueries({ queryKey: ["review-sessions-index", user.id] });
      handleSubjectChange(subj, newSlug, today);
    } catch (e) {
      console.warn("[startTodaySession]", e);
      slugNavSourceRef.current = "control";
    }
  }, [user?.id, qc, onboardingIncomplete, subject, handleSubjectChange]);

  const confirmDeleteSession = useCallback(async () => {
    const row = deleteDialogSession;
    if (!user?.id || !row) return;
    const slug = row.session_slug;
    setDeleteDialogSession(null);
    if (activeSessionSlug === slug) {
      applyActiveSessionSlug(null);
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

  const summaryCardProps = { collapsible: true, defaultCollapsed: true };

  const buildSummaryBelow = (mobile: boolean) =>
    sessionCard?.kind === "loading" ? (
      <ReviewSummaryCard variant="skeleton" {...(mobile ? summaryCardProps : {})} />
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
        {...(mobile ? summaryCardProps : {})}
      />
    ) : sessionCard?.kind === "full" ? (
      <ReviewSummaryCard
        subject={sessionCard.subject}
        weakPoint={sessionCard.weak_point}
        tonightTask={sessionCard.tonight_task}
        followUp={sessionCard.follow_up}
        mastered={sessionCard.mastered}
        {...(mobile ? summaryCardProps : {})}
      />
    ) : null;

  const handlePhotoRemediationMarkProgress = useCallback(
    async (messageId: string, action: RemediationAction) => {
      const remediation = photoRemediationByMessageId[messageId];
      if (!remediation) {
        throw new Error("missing remediation");
      }
      const current = photoRemediationProgressByMessageId[messageId] ?? {
        video_watched: false,
        practice_done: false,
      };
      const next = await recordPhotoRemediationProgress({
        coachMessageId: messageId,
        subject: remediation.subject,
        knowledgePoint: remediation.primaryKnowledgePoint,
        action,
        current,
      });
      setPhotoRemediationProgressByMessageId((prev) => ({ ...prev, [messageId]: next }));
      return next;
    },
    [photoRemediationByMessageId, photoRemediationProgressByMessageId],
  );

  const renderChatPanel = (layout: "default" | "mobile") => (
    <SageChatPanel
      ref={chatPanelRef}
      key={`${layout}-${chatScopeKey}`}
      layout={layout}
      messages={messages}
      onSubmit={(text) => void send(text)}
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
      pendingImages={pendingImages}
      onImagesSelected={handleImagesSelected}
      onRemoveImage={handleRemoveImage}
      photoAnalysisLoading={photoAnalysisLoading}
      streamingPhotoMarkdown={streamingPhotoMarkdown}
      photoRemediationByMessageId={photoRemediationByMessageId}
      photoRemediationProgressByMessageId={photoRemediationProgressByMessageId}
      onPhotoRemediationMarkProgress={handlePhotoRemediationMarkProgress}
      onPhotoRemediationFollowUp={(text) => chatPanelRef.current?.setInputValue(text)}
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
            {isSummarySubmitting ? "整理中…" : "整理今晚任务"}
          </Button>
        ) : null
      }
      belowForm={buildSummaryBelow(layout === "mobile")}
    />
  );

  const pickSessionFromDrawer = (row: SessionRow) => {
    loadSessionFromPicker(row);
    setDrawerOpen(false);
  };

  const isTodaySessionActive =
    selectedDate === localYmd() && !!activeSessionSlug && !onboardingIncomplete;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/app/review/archive") {
    return <Outlet />;
  }

  return (
    <>
      <div className="fixed inset-0 z-30 flex h-dvh max-h-dvh flex-col overflow-hidden bg-background lg:hidden">
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
              to="/app/today"
              hash="archive"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              今晚任务
            </Link>
          </div>
        </div>

        {!onboardingIncomplete && (
          <div className="scrollbar-hide flex h-10 shrink-0 items-center gap-2 overflow-x-auto px-4">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickReviewSubject(s)}
                data-active={subject === s}
                className="wiki-chip wiki-chip--pill"
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
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
            aria-label="关闭复盘历史"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}
        <div
          className={cn(
            "wiki-mobile-history-drawer fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col bg-[var(--wiki-bg)] shadow-2xl transition-transform duration-200 ease-out",
            drawerOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
          )}
          aria-hidden={!drawerOpen}
        >
          <div className="wiki-mobile-history-header">
            <h2 className="text-base font-semibold text-[var(--wiki-heading)]">复盘历史</h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="wiki-mobile-history-close"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          {!onboardingIncomplete ? (
            <div className="shrink-0 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  void startTodaySession();
                  setDrawerOpen(false);
                }}
                data-active={isTodaySessionActive}
                className="wiki-session-today-btn"
              >
                <span className="wiki-session-today-title">
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  开始今天的复盘
                </span>
                <span className="wiki-session-today-meta">
                  {localYmd()} · {chatSubject}
                </span>
              </button>
            </div>
          ) : null}
          <div className="wiki-mobile-history-scroll">
            {drawerSessionGroups.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--wiki-muted)]">暂无复盘记录</p>
            ) : (
              drawerSessionGroups.map((group) => (
                <section key={group.label} className="wiki-mobile-history-group">
                  <p className="wiki-mobile-history-group-label">{group.label}</p>
                  <ul className="wiki-mobile-history-list">
                    {group.rows.map((row) => {
                      const tag =
                        MOBILE_SUBJECT_TAG_STYLES[row.subject] ?? MOBILE_SUBJECT_TAG_STYLES["地理"];
                      const active = activeSessionSlug === row.session_slug;
                      return (
                        <li key={`${row.session_slug}-${row.subject}`}>
                          <button
                            type="button"
                            onClick={() => pickSessionFromDrawer(row)}
                            data-active={active ? "true" : undefined}
                            className="wiki-mobile-history-item"
                          >
                            <span className="wiki-mobile-history-item-head">
                              <span
                                className="wiki-mobile-history-subject"
                                style={{ backgroundColor: tag.bg, color: tag.color }}
                              >
                                {row.subject}
                              </span>
                              <time className="wiki-mobile-history-time">
                                {formatSessionTime(row.started_at)}
                              </time>
                            </span>
                            <span className="wiki-mobile-history-preview">
                              {sessionListPreview(row)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="hidden h-full min-h-0 flex-1 flex-col overflow-hidden lg:flex">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="min-w-0 flex-1">
          <nav className="wiki-breadcrumb" aria-label="面包屑">
            <Link to="/app/today">首页</Link>
            <span className="wiki-breadcrumb-sep">›</span>
            <span className="text-[var(--wiki-nav-fg)]">复盘</span>
          </nav>
          <h1 className="wiki-page-title mt-2">
            {onboardingIncomplete ? "学科复盘" : `复盘 · ${chatSubject}`}
          </h1>
          <p className="mt-1 text-sm text-[var(--wiki-muted)]">
            {onboardingIncomplete
              ? `首次复盘使用「${ONBOARDING_REVIEW_SUBJECT}」引导；完成后在侧边栏选择科目。`
              : "侧边栏切换科目；左侧选历史会话，或开始今天的复盘。"}
          </p>
        </div>
        <Link
          to="/app/today"
          hash="archive"
          className="shrink-0 text-sm font-medium text-[var(--wiki-link)] underline-offset-4 hover:underline"
        >
          查看今晚任务
        </Link>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 md:px-5",
          "lg:flex-row lg:items-stretch",
        )}
      >
        <aside className="hidden min-h-0 lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:pr-4">
          <p className="mb-2 wiki-field-label">
            {chatSubject} · 历史
            {filteredSessionRows.length > 0 ? (
              <span className="ml-1 font-normal normal-case text-[var(--wiki-muted)]">
                ({filteredSessionRows.length})
              </span>
            ) : null}
          </p>

          {!onboardingIncomplete ? (
            <button
              type="button"
              onClick={() => void startTodaySession()}
              data-active={isTodaySessionActive}
              className="wiki-session-today-btn"
            >
              <span className="wiki-session-today-title">
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                开始今天的复盘
              </span>
              <span className="wiki-session-today-meta">
                {localYmd()} · {chatSubject}
              </span>
            </button>
          ) : null}

          <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filteredSessionRows.map((s) => {
              const rowActive = activeSessionSlug === s.session_slug;
              return (
                <li key={s.session_slug} className="flex items-stretch gap-0.5">
                  <button
                    type="button"
                    onClick={() => loadSessionFromPicker(s)}
                    data-active={rowActive}
                    className="wiki-session-btn"
                  >
                    <span className="block">
                      {formatSessionListLabel(s.session_date, s.started_at)}
                    </span>
                    <span className="wiki-session-preview">{sessionListPreview(s)}</span>
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
              <li className="px-2.5 py-2 text-sm text-[var(--wiki-muted)]">
                {sessionIndex.length === 0
                  ? "暂无记录，从下方「今天」开始。"
                  : `${chatSubject} 还没有复盘记录。`}
              </li>
            )}
          </ul>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!onboardingIncomplete && !hasSessionForSelectedDate && messages.length === 0 ? (
            <p className="mb-2 shrink-0 text-xs text-[var(--wiki-muted)]">
              新会话；发第一条消息后，会出现在左侧历史列表。
            </p>
          ) : null}

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
