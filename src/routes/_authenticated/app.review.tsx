import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReflections, submitReflection } from "@/lib/reflection.functions";
import { REFLECTION_QUESTIONS, SUBJECTS, type Subject } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/app/review")({ component: Review });

function Review() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [diagnosis, setDiagnosis] = useState<string | null>(null);

  const submit = useServerFn(submitReflection);
  const list = useServerFn(listReflections);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["reflections"], queryFn: () => list() });

  const m = useMutation({
    mutationFn: (vars: { subject: Subject; answers: Record<string, string> }) => submit({ data: vars }),
    onSuccess: (r) => { setDiagnosis(r.diagnosis); qc.invalidateQueries({ queryKey: ["reflections"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (diagnosis && subject) {
    return (
      <div className="space-y-5">
        <button onClick={() => { setDiagnosis(null); setSubject(null); setAnswers({}); }} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> 完成</button>
        <h1 className="text-2xl font-semibold">{subject} · 诊断</h1>
        <article className="prose prose-sm max-w-none rounded-3xl border border-border bg-card p-6 dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground">
          <ReactMarkdown>{diagnosis}</ReactMarkdown>
        </article>
      </div>
    );
  }

  if (subject) {
    const qs = REFLECTION_QUESTIONS[subject];
    const filled = qs.every((q) => (answers[q.id] ?? "").trim().length > 0);
    return (
      <div className="space-y-5">
        <button onClick={() => setSubject(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> 换学科</button>
        <h1 className="text-2xl font-semibold">{subject} 复盘</h1>
        <p className="text-sm text-muted-foreground">不用写很长。先把今天最具体的那道题/那一刻说出来。</p>
        <div className="space-y-4">
          {qs.map((q) => (
            <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
              <label className="text-sm font-medium">{q.label}</label>
              <Textarea
                placeholder={q.placeholder ?? "随便写，写到自己看得懂就行"}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                className="mt-2 min-h-20 rounded-xl"
              />
            </div>
          ))}
        </div>
        <Button onClick={() => m.mutate({ subject, answers })} disabled={!filled || m.isPending} className="h-12 w-full rounded-2xl text-base">
          {m.isPending ? "Sage 正在看…" : "让 Sage 诊断"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">学科复盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">选一科，把今天卡住的那一段拆出来。</p>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {SUBJECTS.map((s) => (
          <button key={s} onClick={() => { setSubject(s); setAnswers({}); }} className="rounded-2xl border border-border bg-card p-4 text-base font-medium transition hover:border-primary/40 hover:bg-primary/5">
            {s}
          </button>
        ))}
      </div>

      {data?.items?.length ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">最近的复盘</h2>
          <div className="space-y-2">
            {data.items.slice(0, 6).map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{r.subject}</span>
                  <span>{new Date(r.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{(r.ai_diagnosis ?? "").replace(/[#*]/g, "")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
