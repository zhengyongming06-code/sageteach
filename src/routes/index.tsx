import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Link2, Moon, Sparkles, type LucideIcon } from "lucide-react";
import { LandingCapabilityGraph } from "@/components/landing-capability-graph";
import { SageLogo } from "@/components/sage-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Landing,
});

const visionPillars: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Link2,
    title: "把复盘串成一条线",
    desc: "不只记一道题，而是连接卡点、方法、情绪与下一步行动。",
  },
  {
    icon: Moon,
    title: "每天结束后的第二大脑",
    desc: "回顾今天真正难在哪，安排今晚最小可行任务，第二天继续跟进。",
  },
  {
    icon: Sparkles,
    title: "持续进化的 AI 教练",
    desc: "诊断、知识图谱、拍照识题与个性化训练，随你的数据越用越准。",
  },
];

const products = [
  {
    status: "live" as const,
    title: "学科复盘",
    desc: "今天哪道题让你卡了最久？说出来，拆开看，把卡点变成可执行的今晚任务。",
  },
  {
    status: "live" as const,
    title: "AI 教练",
    desc: "它记得你上次卡在哪，不会每次都从头问你，对话围绕你的真实薄弱点展开。",
  },
  {
    status: "live" as const,
    title: "提分规划",
    desc: "离目标还差多少分，先搞清楚该把时间花在哪，而不是盲目刷题。",
  },
  {
    status: "preview" as const,
    title: "知识追踪",
    desc: "拍照识题后自动抽取知识点，逐步建立你的个人知识图谱与掌握度。",
  },
] as const;

function productStatusLabel(status: (typeof products)[number]["status"]) {
  if (status === "live") return "已上线";
  if (status === "preview") return "预览中";
  return "规划中";
}

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

        <section id="vision" className="sy-section sy-section-vision sy-vision-band px-4 sm:px-0">
          <div className="sy-vision-header">
            <p className="sy-eyebrow">愿景</p>
            <h2 className="sy-h2">连接的复盘，而不是散落的笔记。</h2>
            <p className="sy-vision-lead">
              让备考学习更连贯、更可执行、更可追踪——每次复盘都指向下一步行动。
            </p>
          </div>
          <ul className="sy-vision-pillars">
            {visionPillars.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="sy-vision-pillar">
                <span className="sy-vision-pillar-icon" aria-hidden>
                  <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
                </span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="products" className="sy-section sy-section-products px-4 sm:px-0">
          <div className="sy-section-heading-stacked">
            <p className="sy-eyebrow">功能</p>
            <h2 className="sy-h2">Sage 能帮你做什么</h2>
            <p className="sy-section-kicker">
              从每日复盘出发，逐步扩展为完整的学习支持系统。
            </p>
          </div>
          <div className="sy-product-grid">
            {products.map((p) => (
              <article
                key={p.title}
                className={cn(
                  "sy-product-card",
                  p.status === "live" && "sy-product-card-live",
                  p.status === "preview" && "sy-product-card-preview",
                )}
              >
                <span
                  className={cn(
                    "sy-status",
                    p.status === "preview" && "sy-status-preview",
                  )}
                >
                  {productStatusLabel(p.status)}
                </span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="access" className="sy-section sy-access-band sy-access-layout px-4 sm:px-0">
          <div className="sy-section-intro">
            <p className="sy-eyebrow">开始使用</p>
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
