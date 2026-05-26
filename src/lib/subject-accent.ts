import { SUBJECTS } from "@/lib/subjects";
import { cn } from "@/lib/utils";

/** Per-subject accent color (left gradient bar) + soft background tint. */
const ACCENTS: Record<string, { color: string; bg: string; gradient: string }> = {
  语文: {
    color: "#f59e0b",
    bg: "bg-amber-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#f59e0b,transparent)]",
  },
  数学: {
    color: "#0ea5e9",
    bg: "bg-sky-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#0ea5e9,transparent)]",
  },
  英语: {
    color: "#8b5cf6",
    bg: "bg-violet-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#8b5cf6,transparent)]",
  },
  物理: {
    color: "#10b981",
    bg: "bg-emerald-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#10b981,transparent)]",
  },
  化学: {
    color: "#f97316",
    bg: "bg-orange-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#f97316,transparent)]",
  },
  生物: {
    color: "#65a30d",
    bg: "bg-lime-600/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#65a30d,transparent)]",
  },
  政治: {
    color: "#f43f5e",
    bg: "bg-rose-500/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#f43f5e,transparent)]",
  },
  历史: {
    color: "#78716c",
    bg: "bg-stone-500/[0.08]",
    gradient: "before:bg-[linear-gradient(to_bottom,#78716c,transparent)]",
  },
  地理: {
    color: "#0891b2",
    bg: "bg-cyan-600/[0.06]",
    gradient: "before:bg-[linear-gradient(to_bottom,#0891b2,transparent)]",
  },
};

const GRADIENT_BAR =
  "before:pointer-events-none before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:rounded-[2px] before:content-['']";

/** Counteract app shell `px-5` on mobile so cards meet the screen edge. */
export const mobileCardBleedClass =
  "max-md:-mx-5 max-md:rounded-none max-md:border-x-0";

/** Sage follow-up card on Today: amber gradient bar (matches subject accent style). */
export const sageHookCardClass = cn(
  "relative overflow-hidden border-l-0 pl-5",
  GRADIENT_BAR,
  "before:bg-[linear-gradient(to_bottom,#f59e0b,transparent)]",
);

const DEFAULT_ACCENT = {
  color: "hsl(var(--primary))",
  bg: "bg-primary/[0.06]",
  gradient: "before:bg-[linear-gradient(to_bottom,hsl(var(--primary)),transparent)]",
};

function resolveAccent(subject: string) {
  return ACCENTS[subject] ?? DEFAULT_ACCENT;
}

/** Weak-point / archive cards: gradient left bar + tinted background. */
export function subjectAccentCardClass(subject: string): string {
  const a = resolveAccent(subject);
  return cn("relative overflow-hidden border-l-0 pl-4", a.bg, GRADIENT_BAR, a.gradient);
}

/** Today's task rows: gradient left bar only (card keeps its own background). */
export function subjectAccentTaskClass(subject: string): string {
  const a = resolveAccent(subject);
  return cn("relative overflow-hidden border-l-0 pl-4", GRADIENT_BAR, a.gradient);
}

export function subjectBadgeClass(subject: string): string {
  const known = SUBJECTS.includes(subject as (typeof SUBJECTS)[number]);
  return cn(
    "shrink-0 rounded-lg border px-2 py-0.5 text-xs font-medium",
    known
      ? "border-primary/25 bg-primary/10 text-primary"
      : "border-border bg-muted text-muted-foreground",
  );
}
