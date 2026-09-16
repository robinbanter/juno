import { cn } from "@/lib/utils";
import { usd } from "@/lib/juno/format";
import type { CurveState } from "@/lib/juno/types";
import { Triangle } from "../ui/Delta";

/**
 * Progress along the bonding curve toward graduation.
 *
 * The ratio is the DBC program's own quote-side curve progress
 * (`state.getPoolQuoteTokenCurveProgress`), not a price comparison — that
 * ratio is what actually gates the migration into DAMM v2, so it is the only
 * honest thing to put on this bar.
 *
 * The fill runs green → yellow as it approaches the threshold: green means
 * there is still curve left to buy through, yellow means the pool is about to
 * migrate and the curve is about to stop being the venue.
 */
export function CurveProgress({
  curve,
  className,
}: {
  curve: CurveState;
  className?: string;
}) {
  const pct = Math.min(1, Math.max(0, curve.progress));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-j-pos">
        <Triangle up />
        {usd(curve.raisedUsd)}
      </span>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Progress to graduation"
        className="h-2 flex-1 overflow-hidden rounded-full bg-j-line-strong"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct * 100}%`,
            // Sized to the full track so the gradient reads as a fixed
            // heat scale rather than restretching as the fill grows.
            backgroundImage: "var(--j-curve)",
            backgroundSize: `${pct > 0 ? 100 / pct : 100}% 100%`,
          }}
        />
      </div>

      <span className="shrink-0 text-[13px] font-semibold text-j-muted">
        {usd(curve.thresholdUsd)}
      </span>
    </div>
  );
}

/**
 * The thin bar overlaid on a coin's media in the grid and on the coin page.
 * Same data, no labels.
 */
export function CurveProgressBar({ curve }: { curve: CurveState }) {
  const pct = Math.min(1, Math.max(0, curve.progress));
  return (
    <div
      className="absolute inset-x-0 bottom-0 h-1 bg-black/40"
      aria-hidden="true"
    >
      <div
        className="h-full"
        style={{
          width: `${pct * 100}%`,
          backgroundImage: "var(--j-media-progress)",
        }}
      />
    </div>
  );
}
