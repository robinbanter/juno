"use client";

import { useMemo, useState } from "react";

import { percent, since, usd } from "@/lib/juno/format";
import type { Coin, PricePoint } from "@/lib/juno/types";
import { Triangle } from "../ui/Delta";

/**
 * Realised price over time, drawn from the pool's own decoded swaps.
 *
 * Every point is a trade that executed at that price — not a sampled mark, and
 * not an interpolation. That distinction drives three choices here:
 *
 * **The observations are drawn.** A bare line through four trades looks like a
 * continuously quoted market. The dots are where the price was actually
 * established; the line only joins them.
 *
 * **The x axis is real time, not trade number.** Sequence spacing would make
 * eight trades in ten minutes look like eight evenly-spaced sessions. Clustered
 * dots are the truth about when this pool traded.
 *
 * **The y axis does not start at zero.** For a price series a zero baseline
 * compresses every real move into a flat line near the top. The axis is labelled
 * with its own low and high so the range is never implied.
 *
 * Direction is carried by colour *and* by the signed figure in the header. The
 * two colours are Juno's semantic up/down pair, which a red-green colour
 * blindness cannot separate (validated: deuteranopia ΔE 7.7, below the safe
 * floor) — so colour is never the only thing saying which way the price went.
 */

const WIDTH = 640;
const HEIGHT = 400;
/** Room for the y labels on the left and the time band underneath. */
const PAD = { top: 20, right: 64, bottom: 30, left: 12 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** Vertical clearance two right-hand labels need to not overlap. */
const LABEL_GAP = 16;

type Scaled = PricePoint & { x: number; y: number };

export function PriceChart({ coin }: { coin: Coin }) {
  const points = coin.priceHistory;
  const currency = coin.marketCapCurrency;
  const partial = coin.priceHistoryPartial === true;

  if (!points) return <ChartFrame>Price history was not loaded for this view.</ChartFrame>;

  if (points.length === 0) {
    // An empty *partial* read is not an empty market. The two were conflated
    // here, and the chart announced "No trades yet" on a coin whose activity
    // list, three hundred pixels away, was showing four real fills.
    return (
      <ChartFrame>
        {partial
          ? "Trade history could not be read — the RPC is rate-limiting. This pool may well have traded."
          : "No trades yet — this pool has no price history to draw."}
      </ChartFrame>
    );
  }

  if (points.length === 1) {
    // One observation is a price, not a trend. Drawing a line from a single
    // point would invent a second one.
    return (
      <ChartFrame>
        One trade so far, at {price(points[0].price, currency)}. A trend needs a
        second.
      </ChartFrame>
    );
  }

  return <Plot points={points} currency={currency} name={coin.name} partial={partial} />;
}

function Plot({
  points,
  currency,
  name,
  partial,
}: {
  points: PricePoint[];
  currency: string;
  name: string;
  /** The read was cut short, so these are the newest trades, not every trade. */
  partial: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { scaled, low, high, change } = useMemo(() => {
    const prices = points.map((p) => p.price);
    const times = points.map((p) => Date.parse(p.t));

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    // A pool that traded twice at the same price has no range to scale to.
    // Pad it so the line lands mid-plot rather than dividing by zero.
    const span = max - min || max || 1;
    const lowBound = min - span * 0.12;
    const highBound = max + span * 0.12;

    const first = times[0];
    const last = times[times.length - 1];
    const duration = last - first || 1;

    const scaledPoints: Scaled[] = points.map((point) => ({
      ...point,
      x: PAD.left + ((Date.parse(point.t) - first) / duration) * PLOT_W,
      y:
        PAD.top +
        PLOT_H -
        ((point.price - lowBound) / (highBound - lowBound)) * PLOT_H,
    }));

    return {
      scaled: scaledPoints,
      low: min,
      high: max,
      change: (prices[prices.length - 1] - prices[0]) / prices[0],
    };
  }, [points]);

  const up = change >= 0;
  const stroke = up ? "var(--j-pos)" : "var(--j-neg)";
  const last = scaled[scaled.length - 1];
  const active = hover === null ? null : scaled[hover];

  const line = scaled.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${PAD.left},${PAD.top + PLOT_H} ${line} ${last.x.toFixed(2)},${PAD.top + PLOT_H}`;

  // Bigger than the dots, so a point is reachable without landing dead-centre.
  const bandWidth = PLOT_W / scaled.length;

  return (
    <figure className="m-0 flex w-full flex-col">
      <figcaption className="flex items-baseline justify-between px-4 pt-3 text-[13px]">
        <span className="text-j-muted">
          Realised price ·{" "}
          {partial
            ? `${scaled.length} trades read — history incomplete`
            : `${scaled.length} trades`}
        </span>
        {/* The signed figure is what carries direction for a reader who cannot
            separate the two line colours. */}
        <span
          className={up ? "font-semibold text-j-pos" : "font-semibold text-j-neg"}
        >
          <Triangle up={up} /> {percent(change)}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        role="img"
        aria-label={`Price history for ${name}: ${scaled.length} trades, ${percent(change)} from ${price(points[0].price, currency)} to ${price(last.price, currency)}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Hairline grid, one shade off the surface — present, not loud. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = PAD.top + PLOT_H * fraction;
          return (
            <line
              key={fraction}
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y}
              y2={y}
              stroke="var(--j-line)"
              strokeWidth={1}
            />
          );
        })}

        <defs>
          <linearGradient id="juno-price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        <polygon points={area} fill="url(#juno-price-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The trades themselves. A 2px surface ring keeps clustered dots
            separable where the pool traded several times in a minute. */}
        {scaled.map((point, index) => (
          <circle
            key={point.t + index}
            cx={point.x}
            cy={point.y}
            r={active === point ? 5 : 3}
            fill={stroke}
            stroke="var(--j-surface)"
            strokeWidth={2}
          />
        ))}

        {/*
          The y range, labelled rather than implied — but only where it will not
          collide with the endpoint label below. When the last trade sits near
          the top or bottom of the range the two labels land on top of each
          other, and an overlapped price is worse than an absent one. The
          endpoint wins, because it is the number being read.
        */}
        {Math.abs(last.y - (PAD.top + 4)) > LABEL_GAP && (
          <text
            x={PAD.left + PLOT_W + 8}
            y={PAD.top + 4}
            className="fill-j-faint text-[11px] tabular-nums"
          >
            {price(high, currency)}
          </text>
        )}
        {Math.abs(last.y - (PAD.top + PLOT_H)) > LABEL_GAP && (
          <text
            x={PAD.left + PLOT_W + 8}
            y={PAD.top + PLOT_H}
            className="fill-j-faint text-[11px] tabular-nums"
          >
            {price(low, currency)}
          </text>
        )}

        {/* One direct label: the latest price. Not a number on every point. */}
        <text
          x={PAD.left + PLOT_W + 8}
          y={last.y + 4}
          className="text-[11px] font-semibold tabular-nums"
          fill={stroke}
        >
          {price(last.price, currency)}
        </text>

        <text
          x={PAD.left}
          y={HEIGHT - 10}
          className="fill-j-faint text-[11px] tabular-nums"
        >
          {since(points[0].t)}
        </text>
        <text
          x={PAD.left + PLOT_W}
          y={HEIGHT - 10}
          textAnchor="end"
          className="fill-j-faint text-[11px] tabular-nums"
        >
          {since(last.t)}
        </text>

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--j-line-strong)"
            strokeWidth={1}
          />
        )}

        {/* Invisible hit bands, one per trade, each far wider than its dot. */}
        {scaled.map((point, index) => (
          <rect
            key={`hit-${point.t}-${index}`}
            x={PAD.left + index * bandWidth}
            y={PAD.top}
            width={bandWidth}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      {active && (
        <p className="px-4 pb-1 text-[12px] text-j-muted tabular-nums">
          {price(active.price, currency)} · {since(active.t)}
        </p>
      )}

      {/*
        The tooltip enhances; it does not gate. Every plotted value is also here
        in text, and the Activity tab below lists the same trades with their
        sizes and transaction links.
      */}
      <table className="sr-only">
        <caption>{`Price history for ${name}`}</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Price</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`row-${point.t}-${index}`}>
              <td>{new Date(point.t).toISOString()}</td>
              <td>{price(point.price, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * Prices on a bonding curve start far below a cent, so `usd()`'s two-decimal
 * form collapses them all to `$0`. Significant digits are what make an early
 * curve readable.
 */
function price(value: number, currency: string): string {
  if (currency === "USD") {
    return value >= 0.01 ? usd(value, { compact: false }) : `$${value.toPrecision(3)}`;
  }
  const figure = value >= 0.01 ? value.toFixed(4) : value.toPrecision(3);
  return `${figure} ${currency}`;
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center px-8">
      <p className="text-center text-[14px] text-j-faint">{children}</p>
    </div>
  );
}
