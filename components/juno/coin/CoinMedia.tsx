"use client";

import { useRef, useState } from "react";
import { ChartLine, Image as ImageIcon, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Coin } from "@/lib/juno/types";
import { useSwapHistory } from "../useSwapHistory";
import { CurveProgressBar } from "./CurveProgress";
import { PriceChart } from "./PriceChart";

/**
 * The coin's media, with the view toggle underneath that swaps between the
 * artwork and the price chart.
 */
export function CoinMedia({ coin }: { coin: Coin }) {
  const [view, setView] = useState<"media" | "chart">("media");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data, loading } = useSwapHistory(coin.pool, coin.address);

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
        ) : loading ? (
          <ChartMessage>Reading swap history…</ChartMessage>
        ) : data === null ? (
          <ChartMessage>
            Price history is unavailable — the RPC refused the read.
          </ChartMessage>
        ) : data.points.length >= 2 ? (
          <PriceChart points={data.points} />
        ) : (
          <ChartMessage>
            {data.points.length === 1
              ? "One trade so far — not enough for a price history."
              : "No trades yet."}
          </ChartMessage>
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

/**
 * Everything the chart shows when it is not showing a chart.
 *
 * There are three distinct reasons the line can be absent — still reading, the
 * RPC refused, or the pool has fewer than two trades — and they are worth
 * saying apart. "Still indexing" for a pool that has genuinely never traded is
 * a small lie that never resolves.
 */
function ChartMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center px-6">
      <p className="text-center text-[14px] text-j-faint">{children}</p>
    </div>
  );
}
