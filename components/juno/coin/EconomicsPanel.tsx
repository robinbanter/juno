import { cn } from "@/lib/utils";
import type { FeeSchedule, Tokenomics } from "@/lib/juno/economics";
import { tokenAmount } from "@/lib/juno/format";

/**
 * What the pool's config actually enforces: the fee decay, and where supply
 * goes. Both read off-chain rather than restated from the preset's copy.
 */
export function EconomicsPanel({
  fee,
  supply,
  className,
}: {
  fee: FeeSchedule | null;
  supply: Tokenomics | null;
  className?: string;
}) {
  if (!fee && !supply) return null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {fee && <FeeDecay fee={fee} />}
      {supply && <SupplySplit supply={supply} />}
    </div>
  );
}

function FeeDecay({ fee }: { fee: FeeSchedule }) {
  const max = Math.max(...fee.points.map((p) => p.bps), 1);
  const done = fee.secondsRemaining === 0;

  // The decay curve, drawn from the same scheduler the program runs.
  const path = fee.points
    .map((p, i) => {
      const x = (p.period / fee.totalPeriods) * 100;
      const y = 100 - (p.bps / max) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const markerX = (fee.period / fee.totalPeriods) * 100;

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Trading fee</h3>
        <span className="text-[12px] tabular-nums text-j-muted">
          {(fee.currentBps / 100).toFixed(2)}% now
        </span>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-2 h-[52px] w-full"
        role="img"
        aria-label={`Fee decays from ${fee.startBps / 100}% to ${fee.endBps / 100}%, currently ${fee.currentBps / 100}%`}
      >
        <path d={path} fill="none" stroke="var(--j-muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line
          x1={markerX}
          y1="0"
          x2={markerX}
          y2="100"
          stroke="var(--j-brand)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <p className="mt-1 text-[12px] leading-snug text-j-muted">
        {(fee.startBps / 100).toFixed(2)}% at launch, decaying {fee.mode}ly to{" "}
        {(fee.endBps / 100).toFixed(2)}%.{" "}
        {done ? (
          <span className="text-j-faint">Fully decayed — anti-snipe window closed.</span>
        ) : (
          <span className="text-j-brand">
            {formatRemaining(fee.secondsRemaining)} until the floor.
          </span>
        )}
      </p>
    </section>
  );
}

function SupplySplit({ supply }: { supply: Tokenomics }) {
  const rows = [
    { label: "Sold on the curve", pct: supply.curvePct, amount: supply.curveAmount, color: "var(--j-pos)" },
    { label: "Seeded into DAMM v2", pct: supply.migrationPct, amount: supply.migrationAmount, color: "var(--j-brand)" },
    { label: "Leftover buffer", pct: supply.leftoverPct, amount: supply.leftoverAmount, color: "var(--j-line-strong)" },
  ];

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Supply</h3>
        <span className="text-[12px] tabular-nums text-j-muted">
          {tokenAmount(supply.totalSupply)} total
        </span>
      </div>

      <div
        className="mt-2 flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label="Supply split between curve, migration and leftover"
      >
        {rows.map((row) => (
          <span
            key={row.label}
            style={{ width: `${row.pct * 100}%`, background: row.color }}
          />
        ))}
      </div>

      <dl className="mt-2 flex flex-col gap-1 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
            <dt className="flex-1 text-j-muted">{row.label}</dt>
            <dd className="tabular-nums">
              {(row.pct * 100).toFixed(1)}%
              <span className="ml-1.5 text-j-faint">{tokenAmount(row.amount)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatRemaining(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}
