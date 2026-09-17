"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { CurveShape } from "@/lib/juno/curve-shape";

/**
 * The pool's actual bonding curve.
 *
 * The x-axis is supply sold, not segment index: each segment advances x by its
 * own liquidity weight, so a heavily weighted segment is *wide and flat* and a
 * thin one is *narrow and steep*. That is the whole thesis of Juno's presets
 * made visible — an `ipo-book` curve visibly plateaus at both ends, a
 * `thin-name` curve visibly holds its opening price before turning up.
 *
 * Price is plotted on a log scale because a curve spanning 1e-6 to 2.5e-5 is
 * otherwise a flat line followed by a wall.
 */
export function CurveChart({
  shape,
  progress = 0,
  className,
  height = 140,
}: {
  shape: CurveShape;
  /** 0..1 along the curve, used to fill the traded portion. */
  progress?: number;
  className?: string;
  height?: number;
}) {
  const gradientId = useId();
  const [drawn, setDrawn] = useState(0);

  // Animate on mount so the curve draws itself rather than appearing.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(1);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // Clamped at both ends: the first rAF timestamp can precede the captured
      // start, and a negative t makes easeOutCubic negative — which reaches the
      // SVG as a negative rect width and throws.
      const t = Math.max(0, Math.min(1, (now - start) / 650));
      setDrawn(1 - Math.pow(1 - t, 3)); // easeOutCubic
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shape]);

  const geometry = useMemo(() => {
    const { points, startPrice } = shape;
    if (points.length === 0) return null;

    const totalWeight = points.reduce((sum, p) => sum + p.weight, 0);
    const prices = [startPrice, ...points.map((p) => p.price)].filter((v) => v > 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const logMin = Math.log(minP);
    const logSpan = Math.max(1e-9, Math.log(maxP) - logMin);

    const W = 100;
    const H = 100;
    const y = (price: number) =>
      H - ((Math.log(Math.max(price, minP)) - logMin) / logSpan) * H;

    let x = 0;
    const coords: Array<{ x: number; y: number }> = [{ x: 0, y: y(startPrice) }];
    // Depth bars: one per segment, width by liquidity share, height by weight.
    // The price line alone under-reads the shape on a log axis; the bars show
    // the sixteen weights directly.
    const bars: Array<{ x: number; w: number; h: number }> = [];
    for (const point of points) {
      const w = (point.weight / totalWeight) * W;
      bars.push({ x, w, h: point.weight * H });
      x += w;
      coords.push({ x, y: y(point.price) });
    }

    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area, coords, bars, W, H };
  }, [shape]);

  if (!geometry) return null;

  // Width is belt-and-braces clamped: SVG rejects a negative width outright.
  const fillWidth = Math.max(0, Math.min(1, progress)) * geometry.W;
  const clipWidth = Math.max(0, fillWidth * drawn);

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${geometry.W} ${geometry.H}`}
        preserveAspectRatio="none"
        style={{ height, width: "100%" }}
        role="img"
        aria-label={`Bonding curve across ${shape.points.length} segments, ${Math.round(progress * 100)} percent traded`}
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--j-pos)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--j-pos)" stopOpacity="0" />
          </linearGradient>
          {/* The traded portion is clipped to progress, so the fill *is* the
              graduation bar rather than a second, redundant one. */}
          <clipPath id={`${gradientId}-clip`}>
            <rect x="0" y="0" width={clipWidth} height={geometry.H} />
          </clipPath>
        </defs>

        {/* Liquidity depth per segment, behind everything. */}
        {geometry.bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x + 0.4}
            y={geometry.H - bar.h * drawn}
            width={Math.max(0, bar.w - 0.8)}
            height={bar.h * drawn}
            fill="var(--j-line-strong)"
            opacity={0.55}
          />
        ))}

        <path d={geometry.area} fill={`url(#${gradientId}-fill)`} clipPath={`url(#${gradientId}-clip)`} />
        <path
          d={geometry.line}
          fill="none"
          stroke="var(--j-muted)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawn}
        />
        <path
          d={geometry.line}
          fill="none"
          stroke="var(--j-pos)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          clipPath={`url(#${gradientId}-clip)`}
        />


      </svg>
    </figure>
  );
}
