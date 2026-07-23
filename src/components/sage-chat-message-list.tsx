import { memo, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { PhotoAnalysisMarkdown } from "@/components/photo-analysis-markdown";
import { PhotoRemediationPanel } from "@/components/photo-remediation-panel";
import { unwrapPhotoMarkdown } from "@/lib/question-photo-analysis";
import type { KnowledgeRemediation } from "@/lib/knowledge-topics/recommend";
import type {
  RemediationAction,
  RemediationProgress,
} from "@/lib/knowledge-tracking/remediation-progress";
import {
  isPhotoOnlyMessageContent,
  PHOTO_UPLOADED_LABEL,
} from "@/lib/review-photo-messages";
import type { SageChatMessage } from "@/components/sage-chat-panel";

function markdownUrlTransform(url: string): string {
  const s = url.trim();
  if (!s) return "";
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === "http" || scheme === "https") return s;
    return "";
  }
  if (s.startsWith("//")) return "";
  return s;
}

const markdownComponents: Components = {
  a({ children, href, ...rest }) {
    if (!href) {
      return <span className="underline decoration-primary/40">{children}</span>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
};

function AssistantBubbleContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-p:text-foreground prose-headings:text-foreground prose-p:leading-relaxed">
      {content !== "" ? (
        <ReactMarkdown urlTransform={markdownUrlTransform} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      ) : null}
      {streaming ? (
        <span
          className="ml-0.5 inline-block animate-[sage-cursor_1s_steps(2)_infinite] select-none font-mono text-primary"
          aria-hidden
        >
          ▋
        </span>
      ) : null}
    </div>
  );
}

function UserBubbleContent({ msg }: { msg: SageChatMessage }) {
  const isPhotoPlaceholder =
    msg.photoUploaded === true || isPhotoOnlyMessageContent(msg.content);
  const showPreview = Boolean(msg.imageUrl) && !isPhotoPlaceholder;
  const showText =
    msg.content.trim().length > 0 && !isPhotoOnlyMessageContent(msg.content);

  return (
    <div className="flex flex-col gap-2">
      {showPreview ? (
        <img
          src={msg.imageUrl}
          alt="题目图片"
          className="max-h-40 max-w-full rounded-lg object-contain"
        />
      ) : null}
      {isPhotoPlaceholder ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm",
            "border-white/30 bg-white/10 text-white/90",
          )}
        >
          <span>{PHOTO_UPLOADED_LABEL}</span>
        </div>
      ) : null}
      {showText ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
    </div>
  );
}

export type SageChatMessageListProps = {
  displayMessages: SageChatMessage[];
  isMobile: boolean;
  expand: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyHint: string;
  showHistorySkeleton: boolean;
  messagesLength: number;
  isSending: boolean;
  streamingAssistantText: string | null;
  streamingPhotoMarkdown: string | null;
  photoAnalysisLoading: boolean;
  photoRemediationByMessageId?: Record<string, KnowledgeRemediation>;
  photoRemediationProgressByMessageId?: Record<string, RemediationProgress>;
  onPhotoRemediationMarkProgress?: (
    messageId: string,
    action: RemediationAction,
  ) => Promise<RemediationProgress>;
  onPhotoRemediationFollowUp?: (text: string) => void;
  flyingUserMessageId: string | null;
  newBubbleRef: RefObject<HTMLDivElement | null>;
};

export const SageChatMessageList = memo(function SageChatMessageList({
  displayMessages,
  isMobile,
  expand,
  empty,
  emptyTitle,
  emptyHint,
  showHistorySkeleton,
  messagesLength,
  isSending,
  streamingAssistantText,
  streamingPhotoMarkdown,
  photoAnalysisLoading,
  photoRemediationByMessageId = {},
  photoRemediationProgressByMessageId = {},
  onPhotoRemediationMarkProgress,
  onPhotoRemediationFollowUp,
  flyingUserMessageId,
  newBubbleRef,
}: SageChatMessageListProps) {
  const renderAssistantPhotoBubble = (
    markdown: string,
    loading: boolean,
    key?: string,
    messageId?: string,
  ) => {
    const remediation = messageId ? photoRemediationByMessageId[messageId] : undefined;
    const progress = messageId
      ? photoRemediationProgressByMessageId[messageId]
      : undefined;
    // 解析始终展开在上方；辅学块就绪后出现在下方，避免生成完突然换版式
    const bubble = (
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-[4px_16px_16px_16px] border border-border/80 bg-card px-4 py-4 shadow-sm md:rounded-2xl">
        <PhotoAnalysisMarkdown markdown={markdown} loading={loading} />
        {remediation && !loading ? (
          <PhotoRemediationPanel
            remediation={remediation}
            progress={progress}
            coachMessageId={messageId}
            onMarkProgress={
              messageId && onPhotoRemediationMarkProgress
                ? (action) => onPhotoRemediationMarkProgress(messageId, action)
                : undefined
            }
            onAskFollowUp={onPhotoRemediationFollowUp}
            className="mt-4"
          />
        ) : null}
      </div>
    );

    return (
      <div key={key} className="flex min-w-0 max-w-full justify-start">
        {isMobile ? (
          <div className="flex w-full min-w-0 max-w-[94%] flex-col items-stretch gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="wiki-sage-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
              Sage
            </div>
            {bubble}
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-[min(100%,32rem)]">{bubble}</div>
        )}
      </div>
    );
  };

  const renderAssistantBubble = (content: string, streaming = false, key?: string) => (
    <div key={key} className="flex min-w-0 max-w-full justify-start">
      {isMobile ? (
        <div className="flex w-full min-w-0 max-w-[88%] flex-col items-stretch gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="wiki-sage-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
            Sage
          </div>
          <div className="min-w-0 max-w-full overflow-x-auto rounded-[4px_16px_16px_16px] border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
            <AssistantBubbleContent content={content} streaming={streaming} />
          </div>
        </div>
      ) : (
        <div className="min-w-0 max-w-[88%] overflow-x-auto rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
          <AssistantBubbleContent content={content} streaming={streaming} />
        </div>
      )}
    </div>
  );

  const renderAssistantMessage = (msg: SageChatMessage) => {
    const { isPhotoAnalysis, markdown } = unwrapPhotoMarkdown(msg.content);
    if (isPhotoAnalysis) {
      return renderAssistantPhotoBubble(markdown, false, msg.id, msg.id);
    }
    return renderAssistantBubble(msg.content, false, msg.id);
  };

  return (
    <>
      {empty && (
        <div
          className={cn(
            "grid flex-1 place-items-center px-4 text-center",
            expand || isMobile ? "min-h-0" : "h-full min-h-[180px]",
          )}
        >
          <div>
            <p className={cn("text-foreground", isMobile ? "text-sm" : "text-[15px]")}>
              {emptyTitle}
            </p>
            <p className={cn("mt-2 text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>
              {emptyHint}
            </p>
          </div>
        </div>
      )}
      {showHistorySkeleton && messagesLength === 0 && !isSending && (
        <div className="space-y-3">
          {(["w-56", "w-44", "w-64", "w-40"] as const).map((w, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
              <div
                className={cn(
                  "h-11 max-w-[88%] animate-pulse bg-muted/70",
                  isMobile ? "rounded-[4px_16px_16px_16px]" : "rounded-2xl",
                  w,
                )}
              />
            </div>
          ))}
        </div>
      )}
      {displayMessages.map((msg) => {
        const isFlyingUser =
          msg.role === "user" && (msg.isNew === true || msg.id === flyingUserMessageId);
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            data-message-id={msg.id}
            ref={isFlyingUser ? newBubbleRef : undefined}
            className={`flex min-w-0 max-w-full ${isUser ? "justify-end" : "justify-start"}`}
          >
            {isUser ? (
              <div
                className={cn(
                  "wiki-user-bubble min-w-0 max-w-[88%] overflow-x-auto px-4 py-2.5 text-[15px] leading-relaxed text-white",
                  isMobile
                    ? "rounded-[16px_4px_16px_16px]"
                    : "rounded-2xl",
                  isFlyingUser && "message-new",
                )}
              >
                <UserBubbleContent msg={msg} />
              </div>
            ) : (
              renderAssistantMessage(msg)
            )}
          </div>
        );
      })}
      {(() => {
        const last = displayMessages[displayMessages.length - 1];
        const lastIsPhoto =
          last?.role === "assistant" && unwrapPhotoMarkdown(last.content).isPhotoAnalysis;
        const showPhotoStream =
          (photoAnalysisLoading || streamingPhotoMarkdown != null) && !lastIsPhoto;
        return showPhotoStream
          ? renderAssistantPhotoBubble(
              streamingPhotoMarkdown ?? "",
              photoAnalysisLoading,
              "__photo_streaming__",
            )
          : null;
      })()}
      {!photoAnalysisLoading &&
      streamingPhotoMarkdown == null &&
      (streamingAssistantText != null || isSending)
        ? renderAssistantBubble(streamingAssistantText ?? "", true, "__streaming__")
        : null}
    </>
  );
});
