import { ArrowRight, BarChart3, MessageSquare, Sparkles, Target } from "lucide-react";
import { appSurfaceCardClass } from "@/lib/shell-styles";
import { cn } from "@/lib/utils";

const steps = [
  { icon: Target, title: "今日卡点", desc: "哪道题、哪个知识点卡住了？" },
  { icon: MessageSquare, title: "AI 拆解", desc: "和 Sage 一起把问题拆开看。" },
  { icon: Sparkles, title: "今晚任务", desc: "只安排一件最小可行的事。" },
  { icon: BarChart3, title: "持续追踪", desc: "掌握度与档案随复盘更新。" },
] as const;

/** Sage learning loop — horizontal flow, distinct from hub-and-spoke wiki diagrams. */
export function LandingLearningFlow() {
  return (
    <div
      className={cn(
        "relative min-h-[390px] w-full overflow-hidden p-5 sm:min-h-[460px] sm:p-6 lg:min-h-[520px] lg:max-w-[560px] lg:justify-self-end lg:p-7",
        appSurfaceCardClass,
      )}
      aria-label="Sage 复盘学习闭环"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,var(--sage-canvas-a),transparent_42%),radial-gradient(circle_at_88%_72%,var(--sage-canvas-b),transparent_38%)]"
        aria-hidden
      />
      <div className="relative z-1 flex items-center justify-between gap-3 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
        <span>Learning loop</span>
        <span className="sage-link-pill normal-case tracking-normal">复盘 → 行动 → 追踪</span>
      </div>

      <div className="relative z-1 mt-6 flex flex-col gap-3 lg:mt-8 lg:gap-3.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <div key={step.title} className="relative">
              <div className="flex items-start gap-3 rounded-[10px] border border-border/55 bg-muted/35 p-3.5 sm:p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-card text-[var(--syllagrid-blue)] shadow-[var(--shadow-soft)]">
                  <Icon className="h-5 w-5" aria-hidden strokeWidth={1.75} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-heading">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
              </div>
              {!isLast ? (
                <div className="flex justify-center py-1 text-muted-foreground/70 lg:hidden" aria-hidden>
                  <ArrowRight className="h-4 w-4 rotate-90" strokeWidth={1.75} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className="relative z-1 mt-5 hidden items-center justify-between gap-2 border-t border-border/60 pt-5 lg:flex"
        aria-hidden
      >
        {steps.map((step, index) => (
          <div key={step.title} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground/85">{step.title}</span>
            {index < steps.length - 1 ? (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
            ) : null}
          </div>
        ))}
      </div>

      <p className="relative z-1 mt-5 text-sm leading-relaxed text-muted-foreground">
        不是堆更多笔记，而是把每次复盘串成一条可执行的进步路径。
      </p>
    </div>
  );
}
