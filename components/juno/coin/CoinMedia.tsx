"use client";

import { useRef, useState } from "react";
import { ChartLine, Image as ImageIcon, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Coin } from "@/lib/juno/types";
import { CurveProgressBar } from "./CurveProgress";

/**
 * The coin's media, with the view toggle underneath that swaps between the
 * artwork and the price chart.
 */
export function CoinMedia({
  coin,
  chart,
}: {
  coin: Coin;
  /**
   * The price chart, rendered on the server behind its own Suspense boundary.
   *
   * Passed in rather than built here because the chart needs the pool's whole
   * trade history — the slowest read on the page — while the artwork needs
   * nothing but the row. Taking it as a node lets the media paint immediately
   * and the chart arrive when it is ready.
   */
  chart: React.ReactNode;
}) {
  const [view, setView] = useState<"media" | "chart">("media");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-j-lg bg-j-surface">
        {view === "media" ? (
          <>
            {coin.media.kind === "video" ? (
              <video
                ref={videoRef}
                src={coin.media.url}
                poster={coin.media.posterUrl}
                muted={muted}
                loop
                playsInline
                autoPlay
                className="w-full object-contain"
                style={{ aspectRatio: `${coin.media.width} / ${coin.media.height}` }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coin.media.url}
                alt={coin.name}
                className="w-full object-contain"
                style={{ aspectRatio: `${coin.media.width} / ${coin.media.height}` }}
              />
            )}

            {coin.media.kind === "video" && (
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="absolute right-3 bottom-4 flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}

            {!coin.curve.graduated && <CurveProgressBar curve={coin.curve} />}
          </>
        ) : (
          chart
        )}
      </div>

      <div
        role="tablist"
        aria-label="Media view"
        className="flex items-center gap-1 rounded-full bg-j-surface p-1"
      >
        {(
          [
            { id: "media", label: "Artwork", Icon: ImageIcon },
            { id: "chart", label: "Price chart", Icon: ChartLine },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={view === id}
            aria-label={label}
            title={label}
            onClick={() => setView(id)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-colors",
              view === id ? "bg-j-bg text-j-ink shadow-sm" : "text-j-muted hover:text-j-ink",
            )}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

