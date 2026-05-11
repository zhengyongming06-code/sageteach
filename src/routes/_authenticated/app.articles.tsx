import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { ChevronLeft, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/articles")({ component: Articles });

type Article = { id: string; slug: string; title: string; excerpt: string; tag: string; reading_minutes: number; body: string; created_at: string };

function Articles() {
  const [items, setItems] = useState<Article[]>([]);
  const [open, setOpen] = useState<Article | null>(null);

  useEffect(() => {
    supabase.from("articles").select("*").order("created_at", { ascending: false }).then(({ data }) => setItems((data as Article[]) ?? []));
  }, []);

  if (open) {
    return (
      <div className="space-y-5">
        <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> 返回</button>
        <header>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{open.tag}</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">{open.title}</h1>
          <p className="mt-2 text-xs text-muted-foreground"><Clock className="-mt-0.5 mr-1 inline h-3 w-3" />{open.reading_minutes} 分钟阅读</p>
        </header>
        <article className="prose prose-base max-w-none dark:prose-invert prose-p:leading-loose prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/90">
          <ReactMarkdown>{open.body}</ReactMarkdown>
        </article>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">成长文章</h1>
        <p className="mt-1 text-sm text-muted-foreground">深夜来这里看看，知道不止你一个人这样。</p>
      </header>
      <div className="space-y-3">
        {items.map((a) => (
          <button key={a.id} onClick={() => setOpen(a)} className="w-full rounded-3xl border border-border bg-card p-5 text-left transition hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{a.tag}</span>
              <span>{a.reading_minutes} 分钟</span>
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-balance">{a.title}</h2>
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
