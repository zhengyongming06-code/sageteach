import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { LandingCapabilityGraph } from "@/components/landing-capability-graph";
import { SageLogo } from "@/components/sage-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

const products = [
  {
    tag: "已上线",
    live: true,
    title: "学科复盘",
    desc: "今天哪道题让你卡了最久？说出来，拆开看，把卡点变成可执行的今晚任务。",
  },
  {
    tag: "已上线",
    live: true,
    title: "AI 教练",
    desc: "它记得你上次卡在哪，不会每次都从头问你，对话围绕你的真实薄弱点展开。",
  },
  {
    tag: "已上线",
    live: true,
    title: "提分规划",
    desc: "离目标还差多少分，先搞清楚该把时间花在哪，而不是盲目刷题。",
  },
  {
    tag: "预览中",
    live: true,
    title: "知识追踪",
    desc: "拍照识题后自动抽取知识点，逐步建立你的个人知识图谱与掌握度。",
  },
] as const;

function SessionCheck() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9fafb]">
      <div className="h-2 w-2 animate-pulse rounded-full bg-[#64748b]/60" aria-hidden />
    </div>
  );
}

function Landing() {
  const { session, loading } = useAuth();

  if (loading) return <SessionCheck />;
  if (session) return <Navigate to="/app/today" replace />;

  return (
    <div className="sy-page">
      <header className="sy-site-header px-4 sm:px-0">
        <Link to="/" className="sy-brand">
          <SageLogo className="h-9 w-9" idPrefix="landing" />
          <span className="sy-latin">Sage</span>
        </Link>
        <div className="sy-header-actions">
          <nav className="sy-nav-links max-sm:hidden" aria-label="主导航">
            <a href="#vision">愿景</a>
            <a href="#products">功能</a>
            <a href="#access">开始使用</a>
            <Link to="/login">登录</Link>
          </nav>
          <ThemeToggle />
          <Link to="/signup" className="sy-button sy-button-primary sy-header-register">
            注册
          </Link>
        </div>
      </header>

      <main>
        <section className="sy-hero px-4 sm:px-0" aria-labelledby="hero-title">
          <div className="sy-hero-copy">
            <div className="sy-hero-headline">
              <p className="sy-eyebrow sy-hero-eyebrow">
                <span className="sy-latin">AI</span> 学习复盘 · 中高考备考
              </p>
              <h1 id="hero-title" className="sy-h1 text-balance">
                把今天卡住的那道题，
                <br />
                连进你的知识体系。
              </h1>
            </div>
            <p className="sy-lead">
              Sage 不会说「你一定可以」。它会和你一起，找出今天那道题为什么卡住，
              告诉你今晚先做什么，再决定明天的方向。
            </p>
            <div className="sy-hero-actions">
              <Link to="/signup" className="sy-button sy-button-primary">
                免费注册 <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/login" className="sy-button sy-button-secondary">
                已有账号登录
              </Link>
            </div>
            <p className="sy-access-note">
              学科复盘、AI 教练与每日训练已开放。知识追踪与诊断模块持续完善中。
            </p>
          </div>
          <div className="sy-hero-visual">
            <LandingCapabilityGraph />
          </div>
        </section>

        <section id="vision" className="sy-section sy-two-column px-4 sm:px-0">
          <div className="sy-section-intro">
            <p className="sy-eyebrow sy-latin">Vision</p>
            <h2 className="sy-h2">连接的复盘，而不是散落的笔记。</h2>
          </div>
          <div className="sy-section-copy">
            <p>
              Sage 的目标，是让备考学习更连贯、更可执行、更可追踪。每次复盘不只记录一道题，
              而是把卡点、方法、情绪与下一步行动串成一条线。
            </p>
            <p>
              面向学生与家长，Sage 是每天结束学习后的「第二大脑」：帮你回顾今天真正难在哪里，
              安排今晚最小可行任务，并在第二天继续跟进。
            </p>
            <p>
              作为 AI 教练，Sage 可以持续进化：更精准的学科诊断、知识图谱、拍照识题、
              以及基于你历史数据的个性化训练，都会逐步加入。
            </p>
          </div>
        </section>

        <section id="products" className="sy-section px-4 sm:px-0">
          <div className="sy-section-heading">
            <div className="sy-section-intro">
              <p className="sy-eyebrow sy-latin">Products</p>
              <h2 className="sy-h2">当前与规划中的 Sage 能力</h2>
            </div>
            <p className="sy-section-kicker">
              从每日复盘出发，逐步扩展为完整的学习支持系统。
            </p>
          </div>
          <div className="sy-product-grid">
            {products.map((p) => (
              <article
                key={p.title}
                className={p.live ? "sy-product-card sy-product-card-live" : "sy-product-card"}
              >
                <div className="sy-card-topline">
                  <span className="sy-status">{p.tag}</span>
                  <span className="sy-latin">{p.live ? "Live" : "Planned"}</span>
                </div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="access" className="sy-section sy-access-band sy-access-layout px-4 sm:px-0">
          <div className="sy-section-intro">
            <p className="sy-eyebrow sy-latin">Current Access</p>
            <h2 className="sy-h2">现在注册，开始今天的复盘。</h2>
          </div>
          <div className="sy-access-right">
            <p className="sy-section-copy sy-access-blurb">
              注册后即可使用学科复盘、AI 对话教练与每日训练。拍照识题与知识追踪功能正在预览期，
              我们会根据你的反馈持续优化。
            </p>
            <div className="sy-hero-actions">
              <Link to="/signup" className="sy-button sy-button-primary">
                免费注册 <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/login" className="sy-button sy-button-secondary">
                登录
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="sy-site-footer px-4 sm:px-0">
        <p className="m-0 max-w-2xl leading-relaxed">
          Sage — AI 学习复盘教练，帮助中高考学生把每天的卡点变成可执行的进步。
        </p>
        <p className="sy-latin m-0 shrink-0">© Sage</p>
      </footer>
    </div>
  );
}
