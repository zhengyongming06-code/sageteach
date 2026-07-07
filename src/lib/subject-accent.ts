import { cn } from "@/lib/utils";

/** Today page hero — flat wiki article header. */
export const todayHeroShellClass = cn("");

/** Sage follow-up card on Today. */
export const sageHookCardClass = cn("wiki-callout");

/** Gray wiki tags — no per-subject color accents. */
export function subjectAccentPillClass(_subject?: string): string {
  return "wiki-tag";
}

export function subjectAccentCardClass(_subject?: string): string {
  return "";
}

export function subjectAccentTaskClass(_subject?: string): string {
  return "wiki-prose-row";
}

export function subjectBadgeClass(_subject?: string): string {
  return cn("wiki-tag shrink-0 text-xs font-medium");
}
