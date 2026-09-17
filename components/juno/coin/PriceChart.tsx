"use client";

import { useMemo } from "react";

import type { PricePoint } from "@/lib/juno/indexer";

/**
 * The pool's execution price over time, drawn from real swaps.
 *
 * Every point is one trade that landed: its price is the quote actually paid
 * divided by the base actually received, so the line is effective price
 * including fees rather than the pool's quoted spot. That is the number a
 * trader got, which is the one worth plotting.
 *
 * Deliberately refuses to draw with fewer than two points. One trade is a
 * price, not a history, and a single-point "line" implies a flat market that
 * nobody has evidence for. Below that threshold the caller shows the same
 * honest placeholder it showed before any data arrived.
 */

const VIEW_W = 640;
const VIEW_H = 400;
const PAD = { top: 24, right: 16, bottom: 28, left: 16 };

function format(price: number): string {
  if (price === 0) return "0";
  if (price < 0.001) return price.toExponential(3);
  return price.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

export function PriceChart({ points }: { points: PricePoint[] }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const prices = points.map((point) => point.price);
    const times = points.map((point) => point.t);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const spanPrice = maxPrice - minPrice;
    const spanTime = maxTime - minTime;

    const innerW = VIEW_W - PAD.left - PAD.right;
    const innerH = VIEW_H - PAD.top - PAD.bottom;

    // A perfectly flat series has zero span; pin it to the middle rather than
    // dividing by zero and drawing a line through NaN.
    const x = (t: number) =>
      PAD.left + (spanTime === 0 ? innerW / 2 : ((t - minTime) / spanTime) * innerW);
    const y = (p: number) =>
      PAD.top +
      (spanPrice === 0 ? innerH / 2 : innerH - ((p - minPrice) / spanPrice) * innerH);

    const coords = points.map((point) => [x(point.t), y(point.price)] as const);
    const line = coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px} ${py}`).join(" ");
    const area =
      `${line} L${coords[coords.length - 1][0]} ${VIEW_H - PAD.bottom}` +
      ` L${coords[0][0]} ${VIEW_H - PAD.bottom} Z`;

    return {
      line,
      area,
      coords,
      first: prices[0],
      last: prices[prices.length - 1],
      minPrice,
      maxPrice,
    };
  }, [points]);

  if (!geometry) return null;

  const up = geometry.last >= geometry.first;
  const stroke = up ? "var(--j-pos)" : "var(--j-neg)";
  const gradientId = up ? "juno-chart-up" : "juno-chart-down";

  return (
    <figure className="aspect-[16/10] w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={`Price history: ${points.length} trades, ${format(geometry.first)} to ${format(geometry.last)} quote per coin`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Every trade marked, because on these pools there are few enough that
            each one is meaningful rather than noise. */}
        {geometry.coords.map(([cx, cy], i) => (
          <circle
            key={points[i].t + ":" + i}
            cx={cx}
            cy={cy}
            r={3}
            fill="var(--j-bg)"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <figcaption className="sr-only">
        {points.length} trades between {new Date(points[0].t).toISOString()} and{" "}
        {new Date(points[points.length - 1].t).toISOString()}.
      </figcaption>
    </figure>
  );
}
