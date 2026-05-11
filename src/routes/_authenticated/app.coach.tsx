import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoachHistory, sendCoachMessage } from "@/lib/coach.functions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/app/coach")({ component: Coach });

function Coach() {
  const get = useServerFn(getCoachHistory);
  const send = useServerFn(sendCoachMessage);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["coach"], queryFn: () => get() });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const m = useMutation({
    mutationFn: (content: string) => send({ data: { content } }),
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: ["coach"] });
      const prev = qc.getQueryData<{ messages: any[] }>(["coach"]);
      qc.setQueryData(["coach"], {
        messages: [...(prev?.messages ?? []), { id: "tmp", role: "user", content, created_at: new Date().toISOString() }],
      });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => { qc.setQueryData(["coach"], ctx?.prev); toast.error(e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["coach"] }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages?.length, m.isPending]);

  const messages = data?.messages ?? [];
  const empty = !isLoading && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col md:h-[calc(100dvh-6rem)]">
      <header className="mb-3">
        <h1 className="text-2xl font-semibold tracking-tight">AI 教练</h1>
        <p className="text-xs text-muted-foreground">它记得你说过的事。</p>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-3xl border border-border bg-card/50 p-4">
        {empty && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-base text-foreground">在想什么？</p>
              <p className="mt-2 text-sm text-muted-foreground">可以是一道题、一次模考、一个晚上、一个不敢说出口的念头。</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {m.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"></span>
              </span>
            </div>
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v || m.isPending) return;
          setDraft("");
          m.mutate(v);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const v = draft.trim();
              if (v && !m.isPending) { setDraft(""); m.mutate(v); }
            }
          }}
          placeholder="说一句吧"
          className="min-h-12 flex-1 resize-none rounded-2xl"
        />
        <Button type="submit" disabled={!draft.trim() || m.isPending} size="icon" className="h-12 w-12 shrink-0 rounded-2xl">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
