import { SUBJECTS } from "@/lib/subjects";
import { cn } from "@/lib/utils";

/** Left-border + soft background tint per subject (timeline / summary card). */
const ACCENTS: Record<string, string> = {
  语文: "border-l-amber-500 bg-amber-500/[0.06]",
  数学: "border-l-sky-500 bg-sky-500/[0.06]",
  英语: "border-l-violet-500 bg-violet-500/[0.06]",
  物理: "border-l-emerald-500 bg-emerald-500/[0.06]",
  化学: "border-l-orange-500 bg-orange-500/[0.06]",
  生物: "border-l-lime-600 bg-lime-600/[0.06]",
  政治: "border-l-rose-500 bg-rose-500/[0.06]",
  历史: "border-l-stone-500 bg-stone-500/[0.08]",
  地理: "border-l-cyan-600 bg-cyan-600/[0.06]",
};

export function subjectAccentCardClass(subject: string): string {
  return ACCENTS[subject] ?? "border-l-primary bg-primary/[0.06]";
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
