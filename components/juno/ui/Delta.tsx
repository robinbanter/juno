import { cn } from "@/lib/utils";
import { compact, usd } from "@/lib/juno/format";

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
  currency = "USD",
}: {
  value: number;
  /**
   * Which way to point. Defaults to the sign of `value`.
   *
   * **Null means the direction is unknown** — a pool whose whole trade history
   * is inside the window, or a history the RPC would not serve. It is not the
   * same as zero, and it is rendered without a triangle and without a colour:
   * a green arrow is a claim that the price went up, and pointing one at a
   * number we never measured is the sort of thing a trading screen must not do.
   */
  direction?: number | null;
  className?: string;
  compact?: boolean;
  /** Non-USD values are shown in their own unit rather than a dollar sign. */
  currency?: string;
}) {
  const label =
    currency === "USD" ? usd(value, { compact }) : `${compactValue(value, compact)} ${currency}`;

  if (direction === null) {
    return (
      <span
        className={cn("inline-flex items-center font-semibold tabular-nums text-j-ink", className)}
        title="No price change to report — not enough trade history"
      >
        {label}
      </span>
    );
  }

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
      {label}
    </span>
  );
}

function compactValue(value: number, useCompact: boolean): string {
  return useCompact && Math.abs(value) >= 1000
    ? compact(value)
    : value.toFixed(Math.abs(value) < 1 ? 4 : 2);
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
