"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { formatUsd } from "@/lib/constants";
import { useRegionUnlock } from "./useRegionUnlock";
import type { PartialRegion } from "./PartialVideoStage";

type Rect = { x: number; y: number; w: number; h: number };
type Box = { left: number; top: number; width: number; height: number };

export function PartialImageStage({
  postId,
  previewUrl,
  price,
  regions,
}: {
  postId: string;
  previewUrl: string;
  price: string;
  regions: PartialRegion[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [contain, setContain] = useState<{
    scale: number;
    offX: number;
    offY: number;
    srcW: number;
    srcH: number;
  } | null>(null);

  const [revealed, setRevealed] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const r of regions) if (r.unlocked && r.patchUrl) init[r.id] = r.patchUrl;
    return init;
  });

  const recompute = useCallback(() => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img || !img.naturalWidth || !img.naturalHeight) return;
    const boxW = c.clientWidth;
    const boxH = c.clientHeight;
    const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
    setContain({
      scale,
      offX: (boxW - img.naturalWidth * scale) / 2,
      offY: (boxH - img.naturalHeight * scale) / 2,
      srcW: img.naturalWidth,
      srcH: img.naturalHeight,
    });
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(c);
    return () => ro.disconnect();
  }, [recompute]);

  const boxFor = useCallback(
    (r: Rect): Box | null => {
      if (!contain) return null;
      return {
        left: contain.offX + r.x * contain.srcW * contain.scale,
        top: contain.offY + r.y * contain.srcH * contain.scale,
        width: r.w * contain.srcW * contain.scale,
        height: r.h * contain.srcH * contain.scale,
      };
    },
    [contain],
  );

  return (
    <div
      ref={containerRef}
      className="feed-media relative mx-3 overflow-hidden rounded-md bg-black"
      style={{ aspectRatio: "4 / 5" }}
    >
      <img
        ref={imgRef}
        src={previewUrl}
        alt=""
        onLoad={recompute}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {regions.map((r) => {
        const box = boxFor(r.rect);
        const url = revealed[r.id];
        if (!box || !url) return null;
        return (
          <div
            key={r.id}
            className="motion-patch absolute overflow-hidden rounded-[3px]"
            style={box}
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
          </div>
        );
      })}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg,rgba(255,255,255,.07),transparent 38%)",
        }}
      />

      {regions.map((r) => {
        const box = boxFor(r.rect);
        if (!box || revealed[r.id]) return null;
        return (
          <div key={r.id} className="absolute" style={box}>
            <RegionGate
              postId={postId}
              regionId={r.id}
              price={price}
              onUnlock={(signedUrl) =>
                setRevealed((m) => ({ ...m, [r.id]: signedUrl }))
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function RegionGate({
  postId,
  regionId,
  price,
  onUnlock,
}: {
  postId: string;
  regionId: string;
  price: string;
  onUnlock: (signedUrl: string) => void;
}) {
  const { state, unlock } = useRegionUnlock(postId, regionId, { onUnlock });
  const pending = state === "pending";

  return (
    <button
      type="button"
      onClick={unlock}
      disabled={pending}
      aria-label={`Reveal this area for $${formatUsd(price)}`}
      className="absolute inset-0 flex items-center justify-center transition-transform duration-[140ms] active:scale-[0.97]"
    >
      <span
        className="bg-primary text-primary-fg relative flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-semibold"
        style={{ boxShadow: "0 6px 20px var(--primary-glow)" }}
      >
        {pending ? (
          <span
            aria-hidden
            className="size-[14px] rounded-full border-2 border-white/35 border-t-white"
            style={{ animation: "vspin 0.7s linear infinite" }}
          />
        ) : (
          <Lock size={13} strokeWidth={2.4} />
        )}
        <span className="tabular">${formatUsd(price)}</span>
      </span>
    </button>
  );
}
