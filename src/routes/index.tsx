import type { ReactNode } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Link2, Moon, Sparkles, type LucideIcon } from "lucide-react";
import { LandingCapabilityGraph } from "@/components/landing-capability-graph";
import { SageLogo } from "@/components/sage-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import {
  LANDING_OVERVIEW_STEPS,
  LANDING_PRODUCTS,
  landingLinkProps,
  landingProductStatusLabel,
} from "@/lib/landing-content";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Landing,
});

const visionPillars: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Link2,
    title: "错题 → 知识点",
    desc: "拍照识题后自动标到具体考点，比如弦长、洛伦兹力圆心，而不是一句「数学弱」。",
  },
  {
    icon: Moon,
    title: "视频 + 练题",
    desc: "按知识点推 B 站讲解与同类题，先听再练；题库接入后换真题与授权题。",
  },
  {
    icon: Sparkles,
    title: "AI 找到真卡点",
    desc: "对话追问「卡在哪一步」，整理今晚任务，掌握度随练随更新。",
  },
];

function ProductCtaLink({
  target,
  children,
  className,
}: {
  target: (typeof LANDING_PRODUCTS)[number]["target"];
  children: ReactNode;
  className?: string;
}) {
  const props = landingLinkProps(target);
  if (props.to === "/signup") {
    return (
      <Link to="/signup" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/demo" hash={props.hash} className={className}>
      {children}
    </Link>
  );
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
            <a href="#overview">流程</a>
            <a href="#products">功能</a>
            <Link to="/demo">示例</Link>
            <a href="#contact">联系</a>
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
                拍错题 · 推视频 · 练同类题 · <span className="sy-latin">AI</span> 辅学
              </p>
              <h1 id="hero-title" className="sy-h1 text-balance">
                拍一道错题，
                <br />
                搞定一个知识点。
              </h1>
            </div>
            <p className="sy-lead">
              Sage 从你做错的题里抽出具体考点，推荐 B 站讲解与同类练手题，
              再用对话帮你找到「真不懂的那一步」——不是盲目刷题。
            </p>
            <div className="sy-hero-actions">
              <Link to="/signup" className="sy-button sy-button-primary">
                免费注册 <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/demo" className="sy-button sy-button-secondary">
                看弦长题示例
              </Link>
            </div>
          </div>
          <div className="sy-hero-visual">
            <LandingCapabilityGraph />
          </div>
        </section>

        <section id="vision" className="sy-section sy-section-vision sy-vision-band px-4 sm:px-0">
          <div className="sy-vision-header">
            <p className="sy-eyebrow">愿景</p>
            <h2 className="sy-h2">一道错题，一条搞定路径。</h2>
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

        <section id="overview" className="sy-section sy-section-overview px-4 sm:px-0">
          <div className="sy-section-heading-stacked">
            <p className="sy-eyebrow">流程</p>
            <h2 className="sy-h2">从拍错题到真懂，四步闭环。</h2>
          </div>
          <div className="sy-overview-shell">
            <ol className="sy-overview-steps">
              {LANDING_OVERVIEW_STEPS.map((step) => (
                <li key={step.step} className="sy-overview-step">
                  <span className="sy-overview-step-num sy-latin">{step.step}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="sy-overview-demo-cta">
              <Link to="/demo" hash="capture" className="sy-button sy-button-secondary sy-overview-demo-btn">
                打开闭环示例 <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section id="products" className="sy-section sy-section-products px-4 sm:px-0">
          <div className="sy-section-heading-stacked">
            <p className="sy-eyebrow">功能</p>
            <h2 className="sy-h2">围绕一个知识点的四件事</h2>
          </div>
          <div className="sy-product-grid">
            {LANDING_PRODUCTS.map((p) => (
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
                  {landingProductStatusLabel(p.status)}
                </span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
                <ProductCtaLink target={p.target} className="sy-product-cta">
                  {p.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </ProductCtaLink>
              </article>
            ))}
          </div>
        </section>

        <section id="access" className="sy-section sy-access-band sy-access-layout px-4 sm:px-0">
          <div className="sy-section-intro">
            <p className="sy-eyebrow">开始使用</p>
            <h2 className="sy-h2">注册，拍第一道错题。</h2>
          </div>
          <div className="sy-access-right">
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

        <section id="contact" className="sy-section sy-contact-section px-4 sm:px-0">
          <div className="sy-section-intro">
            <p className="sy-eyebrow">联系</p>
            <h2 className="sy-h2">反馈、合作或学校试用。</h2>
          </div>
          <a href="mailto:Jas-4ever@outlook.com" className="sy-contact-link sy-latin">
            Jas-4ever@outlook.com
          </a>
        </section>
      </main>

      <footer className="sy-site-footer px-4 sm:px-0">
        <p className="m-0 max-w-2xl leading-relaxed">
          Sage — 拍错题、推视频、练同类题、AI 辅学，帮高中生搞定每一个知识点。
        </p>
        <p className="sy-latin m-0 shrink-0">© Sage</p>
      </footer>
    </div>
  );
}
