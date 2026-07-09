import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink, PlayCircle } from "lucide-react";
import { ReviewSummaryCard } from "@/components/review-summary-card";
import { SageLogo } from "@/components/sage-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DEMO_AI_MESSAGES,
  DEMO_PHOTO_CAPTION,
  DEMO_PRACTICE_QUESTIONS,
  DEMO_SUMMARY,
  DEMO_TONIGHT_TASKS,
  DEMO_VIDEOS,
} from "@/lib/landing-content";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  return (
    <div className="sy-page">
      <header className="sy-site-header px-4 sm:px-0">
        <Link to="/" className="sy-brand">
          <SageLogo className="h-9 w-9" idPrefix="demo" />
          <span className="sy-latin">Sage</span>
        </Link>
        <div className="sy-header-actions">
          <Link to="/" className="sy-demo-back max-sm:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回首页
          </Link>
          <ThemeToggle />
          <Link to="/signup" className="sy-button sy-button-primary sy-header-register">
            免费注册
          </Link>
        </div>
      </header>

      <main className="sy-demo-main px-4 sm:px-0">
        <div className="sy-demo-intro">
          <p className="sy-eyebrow">产品示例</p>
          <h1 className="sy-h1">拍错题 → 视频 + 练题 + AI，搞定一个知识点。</h1>
          <p className="sy-lead">
            下面是「圆锥曲线弦长」的静态演示：识点、推 B 站课、同类练手、AI 追问。
            注册后会对你的错题走同样闭环。
          </p>
        </div>

        <section id="capture" className="sy-demo-section">
          <div className="sy-demo-section-head">
            <h2 className="sy-h2">① 拍题识点</h2>
            <p className="sy-section-kicker">复盘里拍照后，从解析提取具体知识点。</p>
          </div>
          <div className="sy-demo-capture-card">
            <p className="sy-demo-capture-type">{DEMO_PHOTO_CAPTION.questionType}</p>
            <p className="sy-demo-capture-summary">{DEMO_PHOTO_CAPTION.summary}</p>
            <div className="sy-demo-tags">
              {DEMO_PHOTO_CAPTION.knowledgePoints.map((kp) => (
                <span key={kp} className="sy-demo-tag">
                  {DEMO_PHOTO_CAPTION.subject} · {kp}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="videos" className="sy-demo-section">
          <div className="sy-demo-section-head">
            <h2 className="sy-h2">② 视频推课</h2>
            <p className="sy-section-kicker">按知识点推荐讲解，外链 B 站（正式版绑定点播/合集）。</p>
          </div>
          <ul className="sy-demo-video-list">
            {DEMO_VIDEOS.map((v) => (
              <li key={v.url}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sy-demo-video-card"
                >
                  <PlayCircle className="h-5 w-5 shrink-0 text-[#00a1d6]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="sy-demo-video-title">{v.title}</p>
                    <p className="sy-demo-video-meta">
                      {v.teacher} · {v.platform}
                      {v.note ? ` · ${v.note}` : ""}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section id="practice" className="sy-demo-section">
          <div className="sy-demo-section-head">
            <h2 className="sy-h2">③ 同类练手</h2>
            <p className="sy-section-kicker">2～3 道同类题检验；后续接真题 / 授权题库。</p>
          </div>
          <ol className="sy-demo-practice-list">
            {DEMO_PRACTICE_QUESTIONS.map((q, i) => (
              <li key={q.id} className="sy-demo-practice-item">
                <span className="sy-demo-practice-num">{i + 1}</span>
                <div>
                  <p className="sy-demo-practice-stem">{q.stem}</p>
                  <p className="sy-demo-practice-source">{q.source} · 预览占位</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="ai" className="sy-demo-section">
          <div className="sy-demo-section-head">
            <h2 className="sy-h2">④ AI 追问</h2>
            <p className="sy-section-kicker">找到「真不懂的一步」，而不是直接给完整解答。</p>
          </div>
          <div className="sy-demo-split">
            <div className="sy-demo-chat" aria-label="AI 辅学示例">
              {DEMO_AI_MESSAGES.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "sy-demo-bubble",
                    m.role === "user" ? "sy-demo-bubble-user" : "sy-demo-bubble-sage",
                  )}
                >
                  {m.role === "assistant" ? (
                    <span className="sy-demo-bubble-label">Sage</span>
                  ) : null}
                  <p>{m.content}</p>
                </div>
              ))}
            </div>
            <div className="sy-demo-aside">
              <p className="sy-demo-aside-label">整理进今晚任务</p>
              <ReviewSummaryCard
                subject={DEMO_SUMMARY.subject}
                weakPoint={DEMO_SUMMARY.weakPoint}
                tonightTask={DEMO_SUMMARY.tonightTask}
              />
            </div>
          </div>
        </section>

        <section id="today" className="sy-demo-section">
          <div className="sy-demo-section-head">
            <h2 className="sy-h2">掌握度 · 今晚任务</h2>
            <p className="sy-section-kicker">练对 / 搞懂后更新档案，任务留在 Today 直到完成。</p>
          </div>
          <ul className="sy-demo-task-list">
            {DEMO_TONIGHT_TASKS.map((row) => (
              <li key={row.task} className={cn("sy-demo-task", row.done && "sy-demo-task-done")}>
                <span className="sy-demo-task-subject">{row.subject}</span>
                <p className="sy-demo-task-text">{row.task}</p>
                <span className="sy-demo-task-status">{row.done ? "已完成" : "待完成"}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sy-demo-cta">
          <h2 className="sy-h2">用你自己的错题走一遍。</h2>
          <p className="sy-section-kicker">
            示例是静态的；注册后在复盘里拍题即可触发识点与辅学流程（视频/题库持续扩充中）。
          </p>
          <div className="sy-hero-actions">
            <Link to="/signup" className="sy-button sy-button-primary">
              免费注册 <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/login" className="sy-button sy-button-secondary">
              已有账号登录
            </Link>
          </div>
        </section>
      </main>

      <footer className="sy-site-footer px-4 sm:px-0">
        <p className="m-0 max-w-2xl leading-relaxed">Sage 产品示例 · 拍错题闭环演示</p>
        <Link to="/" className="sy-latin shrink-0 text-sm font-medium hover:underline">
          回首页
        </Link>
      </footer>
    </div>
  );
}
