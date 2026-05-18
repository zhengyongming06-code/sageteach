import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

/** Block javascript:/data: and other non-http(s) schemes in assistant Markdown. */
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
  a({ node: _n, children, href, ...rest }) {
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

export type SageChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set by parent for one frame after send; panel also detects sends internally. */
  isNew?: boolean;
};

type SageChatPanelProps = {
  messages: SageChatMessage[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  isSending: boolean;
  emptyTitle: string;
  emptyHint: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  /** Fill parent flex column (scroll area grows, min-h-0). */
  expand?: boolean;
  /** Mobile chat-first bubble and composer styling. */
  layout?: "default" | "mobile";
  /** Rendered between the message list and the composer (e.g. actions). */
  betweenScrollAndInput?: ReactNode;
  /** Rendered after the composer (e.g. summary cards). */
  belowForm?: ReactNode;
  /** Loading past session messages: gray bubbles instead of an empty placeholder. */
  showHistorySkeleton?: boolean;
  /** Partial assistant reply while streaming from the model; trailing ▋ is rendered in the panel. */
  streamingAssistantText?: string | null;
  /** Subtle status under the composer (e.g. retry hint). */
  composerHint?: string | null;
};

function AssistantBubbleContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-p:text-foreground/90">
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

export function SageChatPanel({
  messages,
  draft,
  onDraftChange,
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
}: SageChatPanelProps) {
  const isMobile = layout === "mobile";
  const scrollRef = useRef<HTMLDivElement>(null);
  const newBubbleRef = useRef<HTMLDivElement | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const [flyingUserMessageId, setFlyingUserMessageId] = useState<string | null>(null);
  const empty =
    messages.length === 0 && !isSending && !showHistorySkeleton && streamingAssistantText == null;

  useEffect(() => {
    const known = knownMessageIdsRef.current;
    const newUserMessages = messages.filter((m) => m.role === "user" && !known.has(m.id));
    const last = messages[messages.length - 1];

    if (
      newUserMessages.length === 1 &&
      last?.role === "user" &&
      last.id === newUserMessages[0].id &&
      isSending
    ) {
      setFlyingUserMessageId(last.id);
      const clearFly = window.setTimeout(() => setFlyingUserMessageId(null), 150);
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
      return () => window.clearTimeout(clearFly);
    }

    knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages, isSending]);

  useEffect(() => {
    if (!flyingUserMessageId) return;
    const id = flyingUserMessageId;
    const raf = requestAnimationFrame(() => {
      const target =
        newBubbleRef.current ??
        scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(raf);
  }, [flyingUserMessageId]);

  useEffect(() => {
    if (flyingUserMessageId) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, isSending, streamingAssistantText, flyingUserMessageId]);

  const showTypingDots =
    isSending && (streamingAssistantText == null || streamingAssistantText === "");

  const renderAssistantBubble = (content: string, streaming = false, key?: string) => (
    <div key={key} className="flex justify-start">
      {isMobile ? (
        <div className="flex max-w-[88%] flex-col items-start gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1a2e]" aria-hidden />
            Sage
          </div>
          <div className="rounded-[4px_16px_16px_16px] border border-border bg-white px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
            <AssistantBubbleContent content={content} streaming={streaming} />
          </div>
        </div>
      ) : (
        <div className="max-w-[88%] rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
          <AssistantBubbleContent content={content} streaming={streaming} />
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        expand && "h-full min-h-0",
        className,
      )}
      style={style}
    >
      <div
        ref={scrollRef}
        className={cn(
          isMobile
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]"
            : expand
              ? "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4"
              : "min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4 md:min-h-[280px]",
        )}
      >
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
        {showHistorySkeleton && messages.length === 0 && !isSending && (
          <div className="space-y-3">
            {(["w-56", "w-44", "w-64", "w-40"] as const).map((w, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
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
        {messages.map((msg) => {
          const isFlyingUser =
            msg.role === "user" && (msg.isNew === true || msg.id === flyingUserMessageId);
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              data-message-id={msg.id}
              ref={isFlyingUser ? newBubbleRef : undefined}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              {isUser ? (
                <div
                  className={cn(
                    "max-w-[88%] px-4 py-2.5 text-[15px] leading-relaxed",
                    isMobile
                      ? "rounded-[16px_4px_16px_16px] bg-[#1a1a2e] text-white"
                      : "rounded-2xl bg-primary text-primary-foreground",
                    isFlyingUser && "message-new",
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                renderAssistantBubble(msg.content)
              )}
            </div>
          );
        })}
        {streamingAssistantText != null &&
          renderAssistantBubble(streamingAssistantText, true, "__streaming__")}
        {showTypingDots && (
          <div className="flex justify-start">
            {isMobile ? (
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1a2e]" aria-hidden />
                  Sage
                </div>
                <div className="rounded-[4px_16px_16px_16px] border border-border bg-white px-4 py-2.5 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-muted-foreground">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cn("shrink-0", !isMobile && expand && "sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur-sm")}>
        {betweenScrollAndInput ? (
          <div className={cn("mt-3 shrink-0", isMobile && "px-4")}>
            {betweenScrollAndInput}
          </div>
        ) : null}

        {composerHint ? (
          <p className="mt-2 text-center text-xs text-muted-foreground/90 tabular-nums">
            {composerHint}
          </p>
        ) : null}

        {isMobile ? (
          <form
            className="flex h-[52px] shrink-0 items-center px-4 py-[10px]"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <div className="relative flex min-w-0 flex-1 items-center">
              <Textarea
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder={placeholder}
                rows={1}
                className="min-h-0 h-9 w-full resize-none rounded-[24px] border border-border bg-white py-2 pl-4 pr-12 text-base leading-5"
              />
              <Button
                type="submit"
                disabled={!draft.trim() || isSending}
                size="icon"
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="safe-bottom flex shrink-0 items-end gap-2 pb-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={placeholder}
              className="min-h-12 flex-1 resize-none rounded-xl border-border bg-card"
            />
            <Button
              type="submit"
              disabled={!draft.trim() || isSending}
              size="icon"
              className="h-12 w-12 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}

        {belowForm ? <div className={cn("mt-4 shrink-0", isMobile && "px-4 pb-4")}>{belowForm}</div> : null}
      </div>
    </div>
  );
}
