"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Play, Share2, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import { compact, money, usd } from "@/lib/juno/format";
import type { Coin } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Delta } from "../ui/Delta";

/**
 * One full-bleed reel.
 *
 * Playback is driven by `active` rather than by the element itself: only the
 * reel the feed considers on-screen plays, so scrolling never leaves three
 * videos decoding at once.
 */
export function ReelCard({
  coin,
  active,
  near,
  muted,
  onToggleMuted,
  onBuy,
}: {
  coin: Coin;
  active: boolean;
  /**
   * Within one card of the active reel. Only these mount a video source —
   * loading every clip in the feed at once saturates the connection and the
   * browser aborts the requests outright.
   */
  near: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onBuy: (coin: Coin) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);

  // Drive play/pause from `active`. `play()` rejects if the browser blocks
  // autoplay; swallow that rather than throwing an unhandled rejection.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, paused]);

  // Rewind when a reel scrolls away so it restarts on the way back.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || active) return;
    video.currentTime = 0;
    setProgress(0);
  }, [active]);

  // `muted` is a property, not a re-rendered attribute — React will not
  // reflect changes to it, so it has to be set imperatively.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-black"
      aria-label={`${coin.name} by ${coin.creator.handle}`}
    >
      <video
        ref={videoRef}
        // Source is attached only near the active reel; distant cards show
        // their poster until they come into range.
        src={near ? coin.media.url : undefined}
        poster={coin.media.posterUrl}
        loop
        playsInline
        muted={muted}
        preload={active ? "auto" : "none"}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
        className="absolute inset-0 size-full object-cover"
      />

      {/* Tap anywhere to pause. A button rather than an onClick div so it is
          reachable by keyboard and announced. */}
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Play" : "Pause"}
        className="absolute inset-0 size-full focus-visible:outline-none"
      >
        {paused && (
          <span className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play size={28} className="ml-1 text-white" fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </button>

      {/* Legibility scrim. Without it, white text over a bright frame is
          unreadable for a third of any given clip. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

      <ReelSideRail
        coin={coin}
        liked={liked}
        muted={muted}
        onLike={() => setLiked((v) => !v)}
        onToggleMuted={onToggleMuted}
      />

      <ReelFooter coin={coin} onBuy={() => onBuy(coin)} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
        <div
          className="h-full bg-white/80"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </section>
  );
}

function ReelSideRail({
  coin,
  liked,
  muted,
  onLike,
  onToggleMuted,
}: {
  coin: Coin;
  liked: boolean;
  muted: boolean;
  onLike: () => void;
  onToggleMuted: () => void;
}) {
  return (
    <div className="absolute right-3 bottom-32 z-10 flex flex-col items-center gap-5 sm:right-5">
      {/*
        A count nobody stores is not shown.
        
        Likes are not persisted anywhere, so `coin.likes ?? 0` printed a
        confident "0 likes" under every reel — a claim about engagement this
        app has never measured. The affordance stays (a tap still registers
        locally); the fabricated number does not.
      */}
      <ReelAction
        label={liked ? "Unlike" : "Like"}
        count={liked ? 1 : undefined}
        onClick={onLike}
      >
        <Heart
          size={26}
          className={liked ? "text-j-neg" : "text-white"}
          fill={liked ? "currentColor" : "none"}
        />
      </ReelAction>

      <ReelAction label="Comments" count={coin.commentCount}>
        <MessageCircle size={26} className="text-white" />
      </ReelAction>

      <ReelAction label="Share">
        <Share2 size={24} className="text-white" />
      </ReelAction>

      <ReelAction label={muted ? "Unmute" : "Mute"} onClick={onToggleMuted}>
        {muted ? (
          <VolumeX size={24} className="text-white" />
        ) : (
          <Volume2 size={24} className="text-white" />
        )}
      </ReelAction>
    </div>
  );
}

function ReelAction({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count?: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex flex-col items-center gap-1 rounded-full transition-transform active:scale-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
    >
      {children}
      {count !== undefined && (
        <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
          {compact(count, 1)}
        </span>
      )}
    </button>
  );
}

/**
 * Identity, caption, and the trade affordance.
 *
 * The market cap sits next to the Buy button on purpose: a reel is bought on
 * impulse, and the one number that should be impossible to miss is what the
 * thing is currently worth.
 */
function ReelFooter({ coin, onBuy }: { coin: Coin; onBuy: () => void }) {
  const pct = Math.min(1, Math.max(0, coin.curve.progress));

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-4 pr-20 pb-6 sm:pr-24">
      <Link
        href={`/creator/${coin.creator.handle}`}
        className="flex w-fit items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <Avatar src={coin.creator.avatarUrl} alt={coin.creator.handle} size={32} />
        <span className="text-[14px] font-semibold text-white">
          {coin.creator.handle}
        </span>
      </Link>

      <div>
        <Link
          href={`/coin/${coin.address}`}
          className="text-[15px] font-semibold text-white hover:underline"
        >
          {coin.name}
        </Link>
        {coin.description && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/75">
            {coin.description}
          </p>
        )}
      </div>

      {/* Graduation progress, same data as the coin page but reduced to the
          one bar that fits over video. */}
      <div className="flex items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct * 100}%`,
              backgroundImage: "var(--j-curve)",
              backgroundSize: `${pct > 0 ? 100 / pct : 100}% 100%`,
            }}
          />
        </div>
        <span className="text-[11px] font-medium text-white/70 tabular-nums">
          {Math.round(pct * 100)}% to graduation
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="buy" size="md" onClick={onBuy} className="min-w-[124px]">
          Buy
        </Button>
        <span className="flex flex-col leading-tight">
          <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />
          <span className="text-[11px] text-white/60">
            {coin.holders !== null && <>{compact(coin.holders, 1)} holders</>}
            {coin.volume24h !== null && <> · {money(coin.volume24h, coin.marketCapCurrency)} 24h</>}
          </span>
        </span>
      </div>
    </div>
  );
}
