"use client";

import Link from "next/link";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Coin } from "@/lib/juno/types";

/**
 * The three-column post grid.
 *
 * Tiles keep their own aspect ratio rather than being cropped square, which is
 * why the columns stagger. CSS columns handle that without measuring anything
 * on the client, so the grid is correct in the server-rendered HTML.
 */
export function MediaGrid({
  coins,
  hrefFor = (coin) => `/coin/${coin.address}`,
  empty = "No posts yet.",
}: {
  coins: Coin[];
  /** Reels open in the swipe feed rather than on a coin page. */
  hrefFor?: (coin: Coin) => string;
  empty?: string;
}) {
  if (coins.length === 0) {
    return <p className="py-16 text-center text-[14px] text-j-faint">{empty}</p>;
  }

  return (
    <div className="columns-3 gap-0.5 [column-fill:balance]">
      {coins.map((coin) => (
        <MediaTile key={coin.address} coin={coin} href={hrefFor(coin)} />
      ))}
    </div>
  );
}

function MediaTile({ coin, href }: { coin: Coin; href: string }) {
  const { media } = coin;
  const poster = media.posterUrl ?? media.url;

  return (
    <Link
      href={href}
      className="group relative mb-0.5 block break-inside-avoid overflow-hidden bg-j-surface focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
      style={{ aspectRatio: `${media.width} / ${media.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt={coin.name}
        loading="lazy"
        decoding="async"
        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />

      {media.kind === "video" && (
        <span
          className="absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-black/45 text-white"
          aria-label="Video"
        >
          <Play size={10} fill="currentColor" strokeWidth={0} />
        </span>
      )}

      {/* Market cap on hover — the grid stays clean until you go looking. */}
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/60 to-transparent p-2",
          "text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100",
        )}
      >
        {coin.symbol}
      </span>
    </Link>
  );
}
