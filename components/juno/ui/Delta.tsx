import { cn } from "@/lib/utils";
import { usd } from "@/lib/juno/format";

/**
 * A value with a direction triangle. Green up, magenta down — the same two
 * colours the activity feed uses for buys and sells, so direction reads the
 * same everywhere on the page.
 */
export function Delta({
  value,
  direction,
  className,
  compact = true,
}: {
  value: number;
  /** Defaults to the sign of `value`. */
  direction?: number;
  className?: string;
  compact?: boolean;
}) {
  const up = (direction ?? value) >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        up ? "text-j-pos" : "text-j-neg",
        className,
      )}
    >
      <Triangle up={up} />
      {usd(value, { compact })}
    </span>
  );
}

export function Triangle({ up, size = 8 }: { up: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden="true"
      className={up ? undefined : "rotate-180"}
    >
      <path d="M4 0.5 L7.6 7 H0.4 Z" fill="currentColor" />
    </svg>
  );
}
