"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Coin } from "@/lib/juno/types";
import { ReelCard } from "./ReelCard";
import { QuickBuySheet } from "./QuickBuySheet";

/**
 * The vertical swipe feed.
 *
 * Scroll snapping is CSS; this component only decides which reel is "active"
 * so exactly one video is playing. An IntersectionObserver on the scroll
 * container does that far more cheaply than a scroll handler doing maths on
 * every frame.
 */
export function ReelFeed({ reels }: { reels: Coin[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Starts muted because browsers block autoplay with sound, and a feed that
  // silently fails to start is worse than one that starts quiet.
  const [muted, setMuted] = useState(true);
  const [buying, setBuying] = useState<Coin | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setActiveIndex(index);
          }
        }
      },
      // A reel counts as active once most of it is on screen, which lines up
      // with where snap settles.
      { root, threshold: 0.6 },
    );

    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [reels.length]);

  // Arrow keys move between reels — a feed you can only drive by trackpad is
  // unusable on a desktop keyboard.
  const step = useCallback((delta: number) => {
    const root = containerRef.current;
    if (!root) return;
    const next = Math.min(
      root.children.length - 1,
      Math.max(0, activeIndex + delta),
    );
    root.children[next]?.scrollIntoView({ behavior: "smooth" });
  }, [activeIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key.toLowerCase() === "m") {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (reels.length === 0) {
    return (
      <p className="flex h-[60dvh] items-center justify-center text-[14px] text-j-faint">
        No reels yet.
      </p>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        // Fills the viewport between the header (4rem) and, under `lg`, the
        // bottom nav (3.5rem). Sizing this exactly is what keeps the Buy
        // button off the nav instead of behind it.
        className="h-[calc(100dvh-4rem-3.5rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain lg:h-[calc(100dvh-4rem)]"
        style={{ scrollbarWidth: "none" }}
      >
        {reels.map((coin, i) => (
          <div key={coin.address} data-index={i} className="h-full snap-start snap-always">
            <ReelCard
              coin={coin}
              active={i === activeIndex}
              muted={muted}
              onToggleMuted={() => setMuted((m) => !m)}
              onBuy={setBuying}
            />
          </div>
        ))}
      </div>

      <QuickBuySheet coin={buying} onClose={() => setBuying(null)} />
    </>
  );
}
