import { SUBJECTS } from "@/lib/subjects";
import { cn } from "@/lib/utils";

/** Left accent colors per subject (solid border — reliable in WeChat webview). */
const ACCENT_BORDER: Record<string, string> = {
  语文: "border-l-amber-500",
  数学: "border-l-sky-500",
  英语: "border-l-violet-500",
  物理: "border-l-emerald-500",
  化学: "border-l-orange-500",
  生物: "border-l-lime-600",
  政治: "border-l-rose-500",
  历史: "border-l-stone-500",
  地理: "border-l-cyan-600",
};

const ACCENT_BG: Record<string, string> = {
  语文: "bg-amber-500/[0.06]",
  数学: "bg-sky-500/[0.06]",
  英语: "bg-violet-500/[0.06]",
  物理: "bg-emerald-500/[0.06]",
  化学: "bg-orange-500/[0.06]",
  生物: "bg-lime-600/[0.06]",
  政治: "bg-rose-500/[0.06]",
  历史: "bg-stone-500/[0.08]",
  地理: "bg-cyan-600/[0.06]",
};

/** Today page hero: white gradient fills to phone edges. */
export const todayHeroShellClass = cn(
  "max-md:-mx-5 max-md:-mt-6 max-md:px-5 max-md:pt-6 max-md:pb-8",
  "bg-gradient-to-b from-white to-[#eef1f5]",
);

/** Sage follow-up card on Today. */
export const sageHookCardClass = cn(
  "border-l-[3px] border-l-amber-500 bg-amber-50/90 pl-4 dark:bg-amber-950/30",
);

function resolveBorder(subject: string) {
  return ACCENT_BORDER[subject] ?? "border-l-primary";
}

function resolveBg(subject: string) {
  return ACCENT_BG[subject] ?? "bg-primary/[0.06]";
}

/** Weak-point / archive cards. */
export function subjectAccentCardClass(subject: string): string {
  return cn(
    "border-l-[3px] pl-4",
    resolveBorder(subject),
    resolveBg(subject),
  );
}

/** Today's task rows. */
export function subjectAccentTaskClass(subject: string): string {
  return cn("border-l-[3px] pl-4", resolveBorder(subject));
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
