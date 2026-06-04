import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  analyticsQueryKeys,
  checkAnalyticsAdmin,
  fetchProductAnalyticsDashboard,
} from "@/lib/analytics/api";
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
  Camera,
  CheckCircle2,
  Repeat,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/analytics")({
  component: AdminAnalyticsPage,
});

const dauChartConfig = {
  dau: { label: "DAU", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

const streakChartConfig = {
  users: { label: "用户数", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: analyticsQueryKeys.admin,
    queryFn: checkAnalyticsAdmin,
    staleTime: 60_000,
  });

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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">产品分析</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.range.from} — {data?.range.to}（Asia/Shanghai）
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Users}
              label="DAU（今日）"
              value={String(data.dau)}
              hint="日活跃用户数"
            />
            <MetricCard
              icon={Activity}
              label="WAU（近7天）"
              value={String(data.wau)}
              hint="周活跃用户数"
            />
            <MetricCard
              icon={Repeat}
              label="平均连续使用"
              value={`${data.avg_streak_days} 天`}
              hint={`最长 ${data.max_streak_days} 天`}
            />
            <MetricCard
              icon={TrendingUp}
              label="次日留存"
              value={pct(data.retention_d1)}
              hint={`7日留存 ${pct(data.retention_d7)}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={CheckCircle2}
              label="Review 完成率"
              value={pct(data.review_completion_rate)}
              hint={`${data.review_completed} / ${data.review_started} 场次`}
            />
            <MetricCard
              icon={Camera}
              label="拍题次数"
              value={String(data.photo_count)}
              hint="周期内拍照解析"
            />
            <MetricCard
              icon={Target}
              label="训练完成率"
              value={pct(data.daily_training_completion_rate)}
              hint={`${data.daily_training_done} / ${data.daily_training_total} 项`}
            />
            <MetricCard
              icon={TrendingUp}
              label="7日留存"
              value={pct(data.retention_d7)}
              hint="cohort 平均"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">DAU 趋势</h2>
              <ChartContainer config={dauChartConfig} className="mt-4 h-[240px] w-full">
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
              <h2 className="text-sm font-semibold">连续使用天数分布（当前 streak）</h2>
              <ChartContainer config={streakChartConfig} className="mt-4 h-[240px] w-full">
                <BarChart
                  data={data.streak_distribution}
                  margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="days" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="users" fill="var(--color-users)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </section>
          </div>

          <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">管理员配置</p>
            <p className="mt-2">
              在 Supabase SQL Editor 执行：
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                insert into admin_users (user_id) select id from auth.users where email =
                &apos;你的邮箱&apos;;
              </code>
            </p>
          </section>
        </>
      ) : null}
    </div>
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
