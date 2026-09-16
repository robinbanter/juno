"use client";

import { useState } from "react";
import type { DetectedRegion } from "@/lib/db/schema";

/**
 * Draws the detected region boxes over the blurred preview. Boxes are in the
 * original image's pixel coords; the blurred derivative shares those dims, so
 * we read the rendered <img>'s natural size on load and position each box as a
 * percentage — scale-independent.
 */
export function RegionOverlay({
  src,
  regions,
  alt,
}: {
  src: string;
  regions: DetectedRegion[];
  alt: string;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="relative w-full overflow-hidden rounded-md bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block w-full"
        onLoad={(e) =>
          setDims({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          })
        }
      />
      {dims &&
        regions.map((r, i) => {
          const [x1, y1, x2, y2] = r.box;
          return (
            <div
              key={i}
              className="absolute rounded-[3px]"
              style={{
                left: `${(x1 / dims.w) * 100}%`,
                top: `${(y1 / dims.h) * 100}%`,
                width: `${((x2 - x1) / dims.w) * 100}%`,
                height: `${((y2 - y1) / dims.h) * 100}%`,
                border: "2px solid var(--primary)",
                boxShadow: "0 0 0 1px rgba(0,0,0,.45)",
              }}
            >
              <span
                className="absolute -top-[18px] left-0 rounded px-1 text-[10px] font-semibold whitespace-nowrap"
                style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
              >
                {r.label} {Math.round(r.confidence * 100)}%
              </span>
            </div>
          );
        })}
    </div>
  );
}
