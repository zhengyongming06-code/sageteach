import { useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Fill parent flex column (scroll area grows, min-h-0). */
  expand?: boolean;
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
  expand = false,
  betweenScrollAndInput,
  belowForm,
  showHistorySkeleton = false,
  streamingAssistantText = null,
  composerHint = null,
}: SageChatPanelProps) {
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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        expand && "h-full min-h-0",
        className,
      )}
    >
      <div
        ref={scrollRef}
        className={
          expand
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4"
            : "min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4 md:min-h-[280px]"
        }
      >
        {empty && (
          <div
            className={`grid flex-1 place-items-center px-4 text-center ${expand ? "min-h-0" : "h-full min-h-[180px]"}`}
          >
            <div>
              <p className="text-[15px] text-foreground">{emptyTitle}</p>
              <p className="mt-2 text-sm text-muted-foreground">{emptyHint}</p>
            </div>
          </div>
        )}
        {showHistorySkeleton && messages.length === 0 && !isSending && (
          <div className="space-y-3">
            {(["w-56", "w-44", "w-64", "w-40"] as const).map((w, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <div className={cn("h-11 max-w-[88%] animate-pulse rounded-2xl bg-muted/70", w)} />
              </div>
            ))}
          </div>
        )}
        {messages.map((msg) => {
          const isFlyingUser =
            msg.role === "user" && (msg.isNew === true || msg.id === flyingUserMessageId);
          return (
            <div
              key={msg.id}
              data-message-id={msg.id}
              ref={isFlyingUser ? newBubbleRef : undefined}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-foreground",
                  isFlyingUser && "message-new",
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-p:text-foreground/90">
                    <ReactMarkdown
                      urlTransform={markdownUrlTransform}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          );
        })}
        {streamingAssistantText != null && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-p:text-foreground/90">
                {streamingAssistantText !== "" ? (
                  <ReactMarkdown
                    urlTransform={markdownUrlTransform}
                    components={markdownComponents}
                  >
                    {streamingAssistantText}
                  </ReactMarkdown>
                ) : null}
                <span
                  className="ml-0.5 inline-block animate-[sage-cursor_1s_steps(2)_infinite] select-none font-mono text-primary"
                  aria-hidden
                >
                  ▋
                </span>
              </div>
            </div>
          </div>
        )}
        {showTypingDots && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        )}
      </div>

      {betweenScrollAndInput ? <div className="mt-3 shrink-0">{betweenScrollAndInput}</div> : null}

      {composerHint ? (
        <p className="mt-2 text-center text-xs text-muted-foreground/90 tabular-nums">
          {composerHint}
        </p>
      ) : null}

      <form
        className="safe-bottom mt-3 flex shrink-0 items-end gap-2"
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

      {belowForm ? <div className="mt-4 shrink-0">{belowForm}</div> : null}
    </div>
  );
}
