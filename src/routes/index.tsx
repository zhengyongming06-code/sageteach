import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Compass, HeartPulse, LineChart } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

const features = [
  { icon: Brain, title: "学科复盘", desc: "不是写日记，是把今天的失误拆成可修复的几步。" },
  { icon: LineChart, title: "提分规划", desc: "按 ROI 排序你的学科，告诉你哪 20% 拿走 80% 的分。" },
  { icon: HeartPulse, title: "焦虑疏导", desc: "晚上 11 点崩了的时候，有人陪你拆掉那团乱麻。" },
  { icon: Compass, title: "AI 教练", desc: "记得你过去的弱点和反复，回答像学长，不像机器。" },
];

function Landing() {
  const { session } = useAuth();
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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-sage"></span>
            为中国高中生打造的 AI 学习顾问
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            不喊口号的<br className="hidden sm:block" />
            高中学习教练。
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
        </motion.div>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </section>

        <section className="mt-20 rounded-3xl border border-border bg-warm p-8 sm:p-12">
          <p className="text-balance font-serif text-xl leading-relaxed text-warm-foreground sm:text-2xl">
            "高三那年我最怕的，不是考砸，是不知道自己为什么考砸。<br />
            Sage 不哄我，它问我那道题第几步断的——然后我才看清楚。"
          </p>
          <p className="mt-4 text-sm text-muted-foreground">— 一位 2024 届的同学</p>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © Sage · 别一个人扛
      </footer>
    </div>
  );
}
