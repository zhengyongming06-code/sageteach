import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  analyticsQueryKeys,
  fetchProductAnalyticsDashboard,
} from "@/lib/analytics/api";
import { useIsAdmin } from "@/hooks/use-is-admin";
import type { AnalyticsFunnelStep, AnalyticsRankedItem } from "@/lib/analytics/types";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle2,
  Filter,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/analytics")({
  component: AdminAnalyticsPage,
});

const dauChartConfig = {
  dau: { label: "DAU", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);

  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: analyticsQueryKeys.dashboard(days),
    queryFn: () => fetchProductAnalyticsDashboard(days),
    enabled: isAdmin === true,
    staleTime: 30_000,
  });

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const dauSeries = useMemo(
    () =>
      (data?.dau_series ?? []).map((p) => ({
        ...p,
        label: p.date.slice(5),
      })),
    [data?.dau_series],
  );

  if (adminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        验证权限…
      </div>
    );
  }

  if (isAdmin === false) {
    return <Navigate to="/app/today" replace />;
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">产品验证</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.range.from} — {data?.range.to}（Asia/Shanghai）· 聚焦行为漏斗与 AI 质量
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={days === d ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setDays(d)}
            >
              {d} 天
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            刷新
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <Link to="/app/today">返回 Today</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载指标…</p>
      ) : isError ? (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">加载失败</p>
          <p className="text-destructive/90">
            {error instanceof Error ? error.message : "未知错误"}
          </p>
          <p className="text-muted-foreground">
            请确认已在 Supabase SQL Editor 执行 migration，并将当前账号加入{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">admin_users</code>。
          </p>
        </div>
      ) : data ? (
        <>
          {data.needs_validation_migration ? (
            <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">数据库 migration 尚未更新</p>
              <p className="mt-1 text-amber-900/90 dark:text-amber-100/85">
                请在 Supabase SQL Editor 执行{" "}
                <code className="rounded bg-white/60 px-1 py-0.5 text-xs dark:bg-black/30">
                  20260604150000_product_analytics_validation.sql
                </code>
                ，刷新后漏斗 / AI 质量 / 反馈统计才会有真实数据。
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={Users} label="DAU（今日）" value={String(data.dau)} hint="日活跃" />
            <MetricCard icon={Activity} label="WAU（近7天）" value={String(data.wau)} hint="周活跃" />
            <MetricCard
              icon={Camera}
              label="拍题成功"
              value={pct(data.ai_quality.photo_analysis_success_rate)}
              hint={`${data.ai_quality.photo_analysis_successes} / ${data.ai_quality.photo_analysis_attempts} 次`}
            />
            <MetricCard
              icon={CheckCircle2}
              label="Review 完成率"
              value={pct(data.review_completion_rate)}
              hint={`${data.review_completed} / ${data.review_started} 场次`}
            />
          </div>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">用户行为漏斗</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              拍题用户在同周期内逐步完成后续步骤的转化（用户数）
            </p>
            <FunnelChart steps={data.funnel} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">AI 质量监控</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <AiQualityCard
                label="AI 分析成功率"
                rate={data.ai_quality.photo_analysis_success_rate}
                detail={`成功 ${data.ai_quality.photo_analysis_successes} / 尝试 ${data.ai_quality.photo_analysis_attempts}`}
              />
              <AiQualityCard
                label="AI 输出异常率"
                rate={data.ai_quality.ai_output_anomaly_rate}
                detail={`异常 ${data.ai_quality.ai_output_anomalies} / 成功 ${data.ai_quality.photo_analysis_successes}`}
                invert
              />
              <AiQualityCard
                label="知识点抽取成功率"
                rate={data.ai_quality.knowledge_extraction_success_rate}
                detail={`成功 ${data.ai_quality.knowledge_extraction_successes} / 尝试 ${data.ai_quality.knowledge_extraction_attempts}`}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              异常判定：解析过短、缺少步骤结构、旧版/失败提示等启发式规则。
            </p>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <RankedList
              title="最常见卡点"
              icon={Target}
              items={data.feedback.top_weak_points}
              emptyHint="暂无 Review 总结数据"
            />
            <RankedList
              title="最常见错误模式"
              icon={AlertTriangle}
              items={data.feedback.top_mistake_patterns}
              emptyHint="暂无错题模式数据"
            />
            <RankedList
              title="最常点击训练任务"
              icon={Brain}
              items={data.feedback.top_training_tasks}
              emptyHint="暂无点击记录（完成训练会作为备选统计）"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">DAU 趋势</h2>
              <ChartContainer config={dauChartConfig} className="mt-4 h-[220px] w-full">
                <LineChart data={dauSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="dau"
                    stroke="var(--color-dau)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">核心转化快照</h2>
              <ul className="mt-4 space-y-3 text-sm">
                <SnapshotRow label="拍题次数" value={String(data.photo_count)} />
                <SnapshotRow
                  label="训练完成率"
                  value={pct(data.daily_training_completion_rate)}
                  hint={`${data.daily_training_done} / ${data.daily_training_total}`}
                />
                <SnapshotRow
                  label="漏斗末端（完成训练用户）"
                  value={String(data.funnel[data.funnel.length - 1]?.users ?? 0)}
                  hint="拍题起点用户的最终留存"
                />
              </ul>
            </section>
          </div>

          <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">部署说明</p>
            <p className="mt-2">
              执行 migration{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                20260604150000_product_analytics_validation.sql
              </code>
              ；管理员：
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                insert into admin_users (user_id) select id from auth.users where email = &apos;…&apos;;
              </code>
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function FunnelChart({ steps }: { steps: AnalyticsFunnelStep[] }) {
  const maxUsers = Math.max(...steps.map((s) => s.users), 1);

  return (
    <div className="mt-5 space-y-3">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.users / maxUsers) * 100, step.users > 0 ? 8 : 2);
        return (
          <div key={step.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {step.users} 人
                {step.rate_from_previous != null && i > 0 ? (
                  <span className="ml-2 text-xs">↑ {pct(step.rate_from_previous)}</span>
                ) : null}
              </span>
            </div>
            <div className="h-8 overflow-hidden rounded-lg bg-muted/50">
              <div
                className="flex h-full items-center rounded-lg bg-primary/85 px-3 text-xs font-medium text-primary-foreground transition-all"
                style={{ width: `${widthPct}%`, minWidth: step.users > 0 ? "3rem" : "0.5rem" }}
              >
                {step.users > 0 ? step.users : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiQualityCard({
  label,
  rate,
  detail,
  invert = false,
}: {
  label: string;
  rate: number;
  detail: string;
  invert?: boolean;
}) {
  const display = invert ? 1 - rate : rate;
  const tone =
    display >= 0.8 ? "text-emerald-600" : display >= 0.5 ? "text-amber-700" : "text-red-600";

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{pct(rate)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function RankedList({
  title,
  icon: Icon,
  items,
  emptyHint,
}: {
  title: string;
  icon: typeof Target;
  items: AnalyticsRankedItem[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li
              key={`${item.label}-${i}`}
              className="flex items-start justify-between gap-2 rounded-lg bg-muted/25 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="font-medium">{item.label}</span>
                {item.subject ? (
                  <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{item.subject}</p>
                ) : null}
              </div>
              <span className="shrink-0 tabular-nums text-muted-foreground">×{item.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {value}
        {hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
    </li>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
