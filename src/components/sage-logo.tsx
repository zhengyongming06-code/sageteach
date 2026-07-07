import { cn } from "@/lib/utils";

type SageLogoProps = {
  className?: string;
  /** Unique id prefix when multiple logos render on one page (SVG defs). */
  idPrefix?: string;
  /** Show rounded gradient tile behind the mark. */
  withTile?: boolean;
};

/**
 * Sage brand mark — four review-cycle arcs around a center insight dot.
 * Original mark (not copied from third-party network logos).
 */
export function SageLogo({ className, idPrefix = "sage", withTile = true }: SageLogoProps) {
  const gradId = `${idPrefix}-logo-grad`;

  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Sage"
    >
      <title>Sage</title>
      {withTile ? (
        <>
          <defs>
            <linearGradient id={gradId} x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0f9f8f" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill={`url(#${gradId})`} />
        </>
      ) : null}
      <g
        fill="none"
        stroke={withTile ? "#ffffff" : "currentColor"}
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M20 9 A11 11 0 0 1 31 20" opacity="0.95" />
        <path d="M31 20 A11 11 0 0 1 20 31" opacity="0.82" />
        <path d="M20 31 A11 11 0 0 1 9 20" opacity="0.68" />
        <path d="M9 20 A11 11 0 0 1 20 9" opacity="0.55" />
      </g>
      <circle
        cx="20"
        cy="20"
        r="3.2"
        fill={withTile ? "#ffffff" : "currentColor"}
      />
    </svg>
  );
}
