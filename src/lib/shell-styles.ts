import { cn } from "@/lib/utils";

/** App shell canvas — flat wiki canvas (not marketing gradient) */
export const appCanvasClass = "wiki-app";

/** Section eyebrow — blue accent label (Wiki-style in dark) */
export const appEyebrowClass = "wiki-label text-[11px] font-semibold tracking-[0.08em] sm:text-xs";

/** Cards inside app — wiki bordered panels */
export const appSurfaceCardClass = cn("wiki-surface");

export const appMetricTileClass = cn("wiki-stat");

export const appProgressClass = "wiki-progress-strip";

export const authPageClass = "relative flex min-h-screen items-center justify-center px-6 sy-page";

export const authCardClass = cn(
  "sy-product-card sy-product-card-live w-full max-w-sm !min-h-0 p-8",
);

export const landingPrimaryBtnClass = "sy-button sy-button-primary";
export const landingSecondaryBtnClass = "sy-button sy-button-secondary";

export const sageDisplayHeadingClass = "sy-h1";
export const sageSectionHeadingClass = "sy-h2";
export const sageLinkPillClass = "inline-flex items-center rounded-md bg-white/70 px-2 py-0.5 text-sm font-semibold text-[#2563eb] dark:bg-slate-900/55";
