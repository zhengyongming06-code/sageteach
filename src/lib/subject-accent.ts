import { SUBJECTS } from "@/lib/subjects";
import { cn } from "@/lib/utils";

type AccentStyle = {
  /** 1px gradient frame (top accent → transparent/white). */
  borderGradient: string;
  /** Inner fill (tinted → white). */
  fillGradient: string;
};

const ACCENTS: Record<string, AccentStyle> = {
  语文: {
    borderGradient: "from-amber-400/75 via-amber-200/35 to-white",
    fillGradient: "from-amber-50 via-amber-50/55 to-white",
  },
  数学: {
    borderGradient: "from-sky-400/75 via-sky-200/35 to-white",
    fillGradient: "from-sky-50 via-sky-50/55 to-white",
  },
  英语: {
    borderGradient: "from-violet-400/75 via-violet-200/35 to-white",
    fillGradient: "from-violet-50 via-violet-50/55 to-white",
  },
  物理: {
    borderGradient: "from-emerald-400/75 via-emerald-200/35 to-white",
    fillGradient: "from-emerald-50 via-emerald-50/55 to-white",
  },
  化学: {
    borderGradient: "from-orange-400/75 via-orange-200/35 to-white",
    fillGradient: "from-orange-50 via-orange-50/55 to-white",
  },
  生物: {
    borderGradient: "from-lime-500/75 via-lime-200/35 to-white",
    fillGradient: "from-lime-50 via-lime-50/55 to-white",
  },
  政治: {
    borderGradient: "from-rose-400/75 via-rose-200/35 to-white",
    fillGradient: "from-rose-50 via-rose-50/55 to-white",
  },
  历史: {
    borderGradient: "from-stone-400/75 via-stone-200/35 to-white",
    fillGradient: "from-stone-50 via-stone-50/55 to-white",
  },
  地理: {
    borderGradient: "from-cyan-500/75 via-cyan-200/35 to-white",
    fillGradient: "from-cyan-50 via-cyan-50/55 to-white",
  },
};

const DEFAULT_ACCENT: AccentStyle = {
  borderGradient: "from-primary/50 via-primary/15 to-white",
  fillGradient: "from-primary/5 via-primary/[0.03] to-white",
};

export const SAGE_HOOK_GRADIENT_ACCENT: AccentStyle = {
  borderGradient: "from-amber-400/80 via-amber-200/40 to-white",
  fillGradient: "from-amber-50 via-amber-50/65 to-white",
};

export const NEUTRAL_GRADIENT_ACCENT: AccentStyle = {
  borderGradient: "from-border via-border/40 to-white",
  fillGradient: "from-muted/50 via-muted/20 to-white",
};

export const SKY_DIAGNOSTIC_GRADIENT_ACCENT: AccentStyle = {
  borderGradient: "from-sky-400/75 via-sky-200/35 to-white",
  fillGradient: "from-sky-50 via-sky-50/55 to-white",
};

/** Counteract app shell `px-5` on mobile so cards meet the screen edge. */
export const mobileCardBleedClass = "max-md:-mx-5 max-md:rounded-none";

const gradientFrameBase = cn(
  "bg-gradient-to-b p-px shadow-sm",
  "rounded-3xl max-md:rounded-none",
);

const gradientFillBase = cn(
  "bg-gradient-to-b",
  "rounded-[calc(1.5rem-1px)] max-md:rounded-none",
);

function resolveAccent(subject: string): AccentStyle {
  return ACCENTS[subject] ?? DEFAULT_ACCENT;
}

/** Outer wrapper: 1px gradient border frame, full-bleed on mobile. */
export function gradientBorderWrapperClass(accent: AccentStyle, bleed = true): string {
  return cn(bleed && mobileCardBleedClass, gradientFrameBase, accent.borderGradient);
}

/** Inner surface: gradient fill to white. */
export function gradientBorderInnerClass(
  accent: AccentStyle,
  padding = "px-5 py-4",
  rounded?: string,
): string {
  return cn(rounded ?? gradientFillBase, accent.fillGradient, padding);
}

/** Weak-point / archive cards. Set bleed=false when nested inside another bleed section. */
export function subjectAccentCardClasses(subject: string, bleed = true) {
  const a = resolveAccent(subject);
  return {
    wrapper: cn(
      bleed ? gradientBorderWrapperClass(a) : cn("bg-gradient-to-b p-px shadow-sm", a.borderGradient),
    ),
    inner: gradientBorderInnerClass(
      a,
      "px-4 py-3",
      bleed ? undefined : "max-md:rounded-none rounded-lg",
    ),
  };
}

/** Today's task / drawer rows (no outer bleed — parent handles width). */
export function subjectAccentTaskClasses(subject: string) {
  const a = resolveAccent(subject);
  return {
    wrapper: cn("bg-gradient-to-b p-px", a.borderGradient),
    inner: cn(
      "bg-gradient-to-b",
      a.fillGradient,
      "px-4 py-3 max-md:rounded-none rounded-[calc(0.5rem-1px)]",
    ),
  };
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
