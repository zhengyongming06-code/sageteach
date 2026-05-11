import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { generateTodayPlan, getTodayPlan, type PlanShape } from "@/lib/plan.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Target, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/app/today")({ component: Today });

function Today() {
  const { user } = useAuth();
  const get = useServerFn(getTodayPlan);
  const gen = useServerFn(generateTodayPlan);
  const qc = useQueryClient();
  const [profile, setProfile] = useState<{ display_name?: string | null; current_score?: number | null; target_score?: number | null; exam_date?: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name,current_score,target_score,exam_date").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  const { data, isLoading } = useQuery({ queryKey: ["today-plan"], queryFn: () => get() });
  const m = useMutation({
    mutationFn: () => gen(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["today-plan"] }); toast.success("今日计划已生成"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const plan: PlanShape | null = data?.plan ?? null;
  const days = profile?.exam_date ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000)) : null;
  const hour = new Date().getHours();
  const greet = hour < 6 ? "深夜了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 19 ? "下午好" : "晚上好";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">今天，从最重要的一件事开始。</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Target} label="目标" value={profile?.target_score ? `${profile.target_score}` : "—"} />
        <Stat icon={Sparkles} label="当前" value={profile?.current_score ? `${profile.current_score}` : "—"} />
        <Stat icon={Clock} label="距考试" value={days !== null ? `${days} 天` : "—"} />
      </div>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">今日计划</h2>
          <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending} className="rounded-xl">
            {m.isPending ? "生成中…" : plan ? "重新生成" : "让 AI 安排"}
          </Button>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">加载中…</p>
        ) : !plan ? (
          <p className="mt-6 text-sm text-muted-foreground">还没有今天的计划。点上面那颗按钮，让 Sage 看看你最近的复盘，给你排一下。</p>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-balance text-base font-medium">{plan.focus}</p>
            <ul className="space-y-2">
              {plan.tasks?.map((t, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border border-border bg-background p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{t.subject}</span>
                      <span className="font-medium">{t.title}</span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.minutes} 分</span>
                  </div>
                  {t.why && <p className="mt-1.5 text-sm text-muted-foreground">{t.why}</p>}
                </motion.li>
              ))}
            </ul>
            {plan.warning && (
              <div className="flex items-start gap-2 rounded-2xl bg-warm p-4 text-sm text-warm-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {plan.warning}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
