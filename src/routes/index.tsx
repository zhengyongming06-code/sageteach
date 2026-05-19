import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Brain, Compass, HeartPulse, LineChart } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

const features = [
  { icon: Brain, title: "学科复盘", desc: "今天哪道题让你卡了最久？说出来，拆开看。" },
  { icon: LineChart, title: "提分规划", desc: "离目标还差多少分，先搞清楚该把时间花在哪。" },
  { icon: HeartPulse, title: "焦虑疏导", desc: "学不进去、又不敢停下来——这种感觉我懂。" },
  { icon: Compass, title: "AI 教练", desc: "它记得你上次卡在哪，不会每次都从头问你。" },
];

function SessionCheck() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/60" aria-hidden />
    </div>
  );
}

function Landing() {
  const { session, loading } = useAuth();

  if (loading) {
    return <SessionCheck />;
  }

  if (session) {
    return <Navigate to="/app/today" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            S
          </span>
          <span>Sage</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <Link to="/app/today" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">进入</Link>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground">登录</Link>
              <Link to="/signup" className="rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">开始使用</Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10 sm:pt-20">
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Sage 一个帮你复盘提分的 AI
          </h1>
          <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Sage 不会说"你一定可以"。<br />
            它会和你一起，找出今天那道题为什么卡住，
            告诉你今晚先做什么，再决定明天的方向。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to={session ? "/app/today" : "/signup"}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              开始今天的复盘 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
              已有账号 →
            </Link>
          </div>
        </div>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-20 w-full rounded-3xl border border-border bg-warm px-8 py-10 sm:px-12 sm:py-12 max-lg:rounded-2xl max-lg:!p-6">
          <p className="text-balance font-serif text-xl leading-relaxed text-warm-foreground max-lg:text-[18px] max-lg:leading-[1.6] max-lg:tracking-[0.02em] sm:text-2xl">
            成功就是做那些常人坚持不下去的事情，不断突破和超越自己
          </p>
          <p className="mt-4 text-right text-base italic leading-relaxed text-muted-foreground/80 max-lg:mt-4 max-lg:text-[13px] max-lg:text-muted-foreground/60">
            — Simon
          </p>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © Sage
      </footer>
    </div>
  );
}
