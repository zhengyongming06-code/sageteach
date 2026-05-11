import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateScorePlan, getLatestScorePlan } from "@/lib/plan.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/app/plan")({ component: Plan });

function Plan() {
  const get = useServerFn(getLatestScorePlan);
  const gen = useServerFn(generateScorePlan);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["score-plan"], queryFn: () => get() });
  const m = useMutation({
    mutationFn: () => gen(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["score-plan"] }); toast.success("已更新"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Score</h1>
        <p className="mt-1 text-sm text-muted-foreground">不是平均用力，是看哪 20% 能拿走 80% 的分。</p>
      </header>

      <Button onClick={() => m.mutate()} disabled={m.isPending} className="h-12 rounded-2xl px-6">
        {m.isPending ? "Sage 在算…" : data?.plan ? "重新分析一次" : "让 Sage 给我一份"}
      </Button>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : data?.plan?.text ? (
        <article className="prose prose-sm max-w-none rounded-3xl border border-border bg-card p-6 dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90">
          <ReactMarkdown>{data.plan.text}</ReactMarkdown>
          {data.created_at && (
            <p className="mt-4 text-xs text-muted-foreground">生成于 {new Date(data.created_at).toLocaleString("zh-CN")}</p>
          )}
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">还没有分析。先填好你的目标分和考试日期，再生成会更准。</p>
      )}
    </div>
  );
}
