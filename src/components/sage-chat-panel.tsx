import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { isReviewWrapUpMessage } from "@/lib/review-opening";
import { cn } from "@/lib/utils";
import type { PendingChatImage } from "@/components/chat-image-picker";
import { SageChatComposer, type SageChatComposerHandle } from "@/components/sage-chat-composer";
import { SageChatMessageList } from "@/components/sage-chat-message-list";
import { isPhotoOnlyMessageContent } from "@/lib/review-photo-messages";
import type { KnowledgeRemediation } from "@/lib/knowledge-topics/recommend";
import type {
  RemediationAction,
  RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";

export type SageChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  photoUploaded?: boolean;
  isNew?: boolean;
};

export type SageChatPanelHandle = SageChatComposerHandle;

type SageChatPanelProps = {
  messages: SageChatMessage[];
  onSubmit: (text: string) => void;
  isSending: boolean;
  emptyTitle: string;
  emptyHint: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  expand?: boolean;
  layout?: "default" | "mobile";
  betweenScrollAndInput?: ReactNode;
  belowForm?: ReactNode;
  showHistorySkeleton?: boolean;
  streamingAssistantText?: string | null;
  composerHint?: string | null;
  onWrapUpDetected?: () => void;
  pendingImages?: PendingChatImage[];
  onImagesSelected?: (images: PendingChatImage[]) => void;
  onRemoveImage?: (id: string) => void;
  photoAnalysisLoading?: boolean;
  streamingPhotoMarkdown?: string | null;
  photoRemediationByMessageId?: Record<string, KnowledgeRemediation>;
  photoRemediationProgressByMessageId?: Record<string, RemediationProgress>;
  onPhotoRemediationMarkProgress?: (
    messageId: string,
    action: RemediationAction,
  ) => Promise<RemediationProgress>;
  onPhotoRemediationFollowUp?: (text: string) => void;
};

const NEAR_BOTTOM_PX = 100;

export const SageChatPanel = forwardRef(function SageChatPanel(
  {
    messages,
    onSubmit,
    isSending,
    emptyTitle,
    emptyHint,
    placeholder = "输入消息…",
    className = "",
    style,
    expand = false,
    layout = "default",
    betweenScrollAndInput,
    belowForm,
    showHistorySkeleton = false,
    streamingAssistantText = null,
    composerHint = null,
    onWrapUpDetected,
    pendingImages = [],
    onImagesSelected,
    onRemoveImage,
    photoAnalysisLoading = false,
    streamingPhotoMarkdown = null,
    photoRemediationByMessageId = {},
    photoRemediationProgressByMessageId = {},
    onPhotoRemediationMarkProgress,
    onPhotoRemediationFollowUp,
  }: SageChatPanelProps,
  ref: Ref<SageChatPanelHandle>,
) {
  const isMobile = layout === "mobile";
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<SageChatComposerHandle>(null);
  const newBubbleRef = useRef<HTMLDivElement | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const wrapUpTriggeredIdsRef = useRef<Set<string>>(new Set());
  const [flyingUserMessageId, setFlyingUserMessageId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<SageChatMessage | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  /** User intent: only auto-scroll while true (scroll/touch-up disables immediately). */
  const stickToBottomRef = useRef(true);
  const touchStartYRef = useRef(0);

  useImperativeHandle(ref, () => ({
    setInputValue: (value: string) => composerRef.current?.setInputValue(value),
    clearInput: () => composerRef.current?.clearInput(),
  }));

  const displayMessages = useMemo(() => {
    if (!pendingUserMessage) return messages;
    const confirmed = messages.some(
      (m) =>
        m.role === "user" &&
        (m.content === pendingUserMessage.content ||
          (!!pendingUserMessage.imageUrl &&
            (m.photoUploaded === true || isPhotoOnlyMessageContent(m.content)))),
    );
    if (confirmed) return messages;
    return [...messages, pendingUserMessage];
  }, [messages, pendingUserMessage]);

  const empty =
    displayMessages.length === 0 &&
    !isSending &&
    !showHistorySkeleton &&
    streamingAssistantText == null;

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowJumpToLatest(false);
  }, []);

  const disableAutoScroll = useCallback(() => {
    stickToBottomRef.current = false;
    setShowJumpToLatest(true);
  }, []);

  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, [isNearBottom]);

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? 0;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      const y = e.touches[0]?.clientY ?? 0;
      // Finger moves down → user scrolls up to read earlier messages.
      if (y - touchStartYRef.current > 6) {
        disableAutoScroll();
      }
    },
    [disableAutoScroll],
  );

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      if (e.deltaY < 0) disableAutoScroll();
    },
    [disableAutoScroll],
  );

  useEffect(() => {
    if (!pendingUserMessage) return;
    const confirmed = messages.some(
      (m) =>
        m.role === "user" &&
        (m.content === pendingUserMessage.content ||
          (!!pendingUserMessage.imageUrl &&
            (m.photoUploaded === true || isPhotoOnlyMessageContent(m.content)))),
    );
    if (confirmed) {
      setPendingUserMessage(null);
      return;
    }
    if (!isSending) {
      setPendingUserMessage(null);
    }
  }, [isSending, messages, pendingUserMessage]);

  useEffect(() => {
    const known = knownMessageIdsRef.current;
    const newUserMessages = displayMessages.filter((m) => m.role === "user" && !known.has(m.id));
    const last = displayMessages[displayMessages.length - 1];

    if (
      newUserMessages.length === 1 &&
      last?.role === "user" &&
      last.id === newUserMessages[0].id &&
      isSending
    ) {
      setFlyingUserMessageId(last.id);
      const clearFly = window.setTimeout(() => setFlyingUserMessageId(null), 150);
      knownMessageIdsRef.current = new Set(displayMessages.map((m) => m.id));
      return () => window.clearTimeout(clearFly);
    }

    knownMessageIdsRef.current = new Set(displayMessages.map((m) => m.id));
  }, [displayMessages, isSending]);

  useEffect(() => {
    if (!flyingUserMessageId) return;
    if (!stickToBottomRef.current) return;
    const id = flyingUserMessageId;
    const raf = requestAnimationFrame(() => {
      const target =
        newBubbleRef.current ??
        scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "end" });
      setShowJumpToLatest(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [flyingUserMessageId]);

  useEffect(() => {
    if (flyingUserMessageId) return;
    if (!stickToBottomRef.current) {
      const streaming =
        isSending || streamingAssistantText != null || streamingPhotoMarkdown != null;
      if (streaming) setShowJumpToLatest(true);
      return;
    }
    requestAnimationFrame(() => scrollToBottom("auto"));
    setShowJumpToLatest(false);
  }, [
    displayMessages,
    isSending,
    streamingAssistantText,
    streamingPhotoMarkdown,
    flyingUserMessageId,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!onWrapUpDetected || isSending || streamingAssistantText != null) return;
    const last = displayMessages[displayMessages.length - 1];
    if (last?.role !== "assistant" || !isReviewWrapUpMessage(last.content)) return;
    if (wrapUpTriggeredIdsRef.current.has(last.id)) return;
    wrapUpTriggeredIdsRef.current.add(last.id);
    onWrapUpDetected();
  }, [displayMessages, isSending, streamingAssistantText, onWrapUpDetected]);

  const handleOptimisticSend = useCallback(
    ({ text, previewUrl }: { text: string; previewUrl?: string }) => {
      stickToBottomRef.current = true;
      const optimisticId = `__optimistic_${Date.now()}`;
      setPendingUserMessage({
        id: optimisticId,
        role: "user",
        content: text,
        imageUrl: previewUrl,
        isNew: true,
      });
      setFlyingUserMessageId(optimisticId);
      window.setTimeout(() => setFlyingUserMessageId(null), 150);
    },
    [],
  );

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", expand && "h-full min-h-0", className)}
      style={style}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onWheel={handleWheel}
          className={cn(
            isMobile
              ? "h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]"
              : expand
                ? "h-full min-h-0 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4"
                : "min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4 md:min-h-[280px]",
          )}
        >
          <SageChatMessageList
            displayMessages={displayMessages}
            isMobile={isMobile}
            expand={expand}
            empty={empty}
            emptyTitle={emptyTitle}
            emptyHint={emptyHint}
            showHistorySkeleton={showHistorySkeleton}
            messagesLength={messages.length}
            isSending={isSending}
            streamingAssistantText={streamingAssistantText}
            streamingPhotoMarkdown={streamingPhotoMarkdown}
            photoAnalysisLoading={photoAnalysisLoading}
            photoRemediationByMessageId={photoRemediationByMessageId}
            photoRemediationProgressByMessageId={photoRemediationProgressByMessageId}
            onPhotoRemediationMarkProgress={onPhotoRemediationMarkProgress}
            onPhotoRemediationFollowUp={onPhotoRemediationFollowUp}
            flyingUserMessageId={flyingUserMessageId}
            newBubbleRef={newBubbleRef}
          />
        </div>

        {showJumpToLatest ? (
          <div className="flex justify-center border-t border-border/60 bg-background/80 px-4 py-1.5 backdrop-blur-sm">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 rounded-full border border-border bg-background px-3 text-xs shadow-sm"
              onClick={() => {
                stickToBottomRef.current = true;
                scrollToBottom("smooth");
              }}
            >
              ↓ 跳到最新
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "shrink-0",
          !isMobile && expand && "sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur-sm",
        )}
      >
        {betweenScrollAndInput ? (
          <div className={cn("mt-3 shrink-0", isMobile && "px-4")}>{betweenScrollAndInput}</div>
        ) : null}

        {composerHint ? (
          <p className="mt-2 text-center text-xs text-muted-foreground/90 tabular-nums">
            {composerHint}
          </p>
        ) : null}

        <SageChatComposer
          ref={composerRef}
          onSubmit={onSubmit}
          isSending={isSending}
          placeholder={placeholder}
          isMobile={isMobile}
          pendingImages={pendingImages}
          onImagesSelected={onImagesSelected}
          onRemoveImage={onRemoveImage}
          onOptimisticSend={handleOptimisticSend}
        />

        {belowForm ? (
          <div className={cn("mt-2 shrink-0", isMobile && "px-4 pb-2")}>{belowForm}</div>
        ) : null}
      </div>
    </div>
  );
});
