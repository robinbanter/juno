"use client";

import { AlertTriangle, Clock, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { percent, since, usd } from "@/lib/juno/format";
import type { NavReference } from "@/lib/juno/types";

/**
 * Where the curve is trading against the underlying it claims to track.
 *
 * This is the point of the equity presets. `thin-name`, `ipo-book` and
 * `tight-nav` all shape their curve around an asset that has a price somewhere
 * else, and a bonding curve has no idea what that price is. Without a reference
 * mark, "tracks the underlying" is a claim the product cannot support; with one,
 * the deviation is a number anybody can check.
 *
 * The mark is a Pyth price read from its `PriceUpdateV2` account on Solana —
 * the same value a Solana program would see, not an HTTP quote.
 *
 * Three states, kept visually distinct because conflating them would be the
 * whole problem:
 *
 * - **live** — the publisher is current.
 * - **closed** — an equity feed outside exchange hours. The number is the last
 *   close and is labelled as such. This is the normal weekend state, not a
 *   failure, and it must not be dressed up as a live price.
 * - **stale** — the feed has stopped when it should not have. Flagged, because
 *   a band measured against an abandoned mark is worse than no band.
 */
export function NavPanel({ nav, className }: { nav: NavReference; className?: string }) {
  const label = feedLabel(nav.feed);
  /*
   * Three states, not two.
   *
   * `withinBand` is null on a pool with no ratio recorded — the curve's price
   * and the reference's price are not the same kind of number without one, so
   * there is nothing to be inside or outside of. Treating null as "outside"
   * painted a breach on a market nobody had measured.
   */
  const measured = nav.deviation !== null && nav.withinBand !== null;
  const outside = measured && !nav.withinBand;

  return (
    <section
      className={cn("rounded-j border border-j-line p-3", className)}
      aria-label="Net asset value reference"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold">{label} reference</span>
        <StateBadge nav={nav} />
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[21px] font-bold tabular-nums">
          {usd(nav.priceUsd, { compact: false })}
        </span>
        <span
          className={cn(
            "text-[14px] font-semibold tabular-nums",
            !measured ? "text-j-faint" : outside ? "text-j-neg" : "text-j-pos",
          )}
        >
          {measured ? percent(nav.deviation!) : "—"}
        </span>
      </div>

      {measured ? <Band nav={nav} deviation={nav.deviation!} /> : null}

      <p className="mt-2 text-[11px] leading-snug text-j-faint">
        {!measured ? (
          <>
            This market names {label} as its reference but never recorded how
            much of it one token stands for, so the two prices cannot be
            compared. The mark above is {label}&rsquo;s, not this curve&rsquo;s.
          </>
        ) : outside ? (
          <>
            The curve implies {usd(nav.impliedUsd!, { compact: false })} against
            a {usd(nav.priceUsd, { compact: false })} mark —{" "}
            {(Math.abs(nav.deviation!) * 100).toFixed(2)}%{" "}
            {nav.deviation! >= 0 ? "above" : "below"}, outside this
            preset&rsquo;s {nav.bandBps / 100}% band.{" "}
            <Provenance nav={nav} />
          </>
        ) : (
          <>
            The curve implies {usd(nav.impliedUsd!, { compact: false })} against
            a {usd(nav.priceUsd, { compact: false })} mark — inside this
            preset&rsquo;s {nav.bandBps / 100}% band.{" "}
            <Provenance nav={nav} />
          </>
        )}
      </p>
    </section>
  );
}

/**
 * The band as a track, with the curve's deviation marked on it.
 *
 * Centred on zero — the reference price — because the reader's question is
 * "how far off, and which way", which is a polarity question rather than a
 * magnitude one.
 */
function Band({ nav, deviation }: { nav: NavReference; deviation: number }) {
  // Show up to twice the band so a breach is visible rather than pinned to the
  // edge, and clamp so an extreme deviation cannot escape the track.
  const limit = (nav.bandBps / 10_000) * 2;
  const clamped = Math.max(-limit, Math.min(limit, deviation));
  const position = 50 + (clamped / limit) * 50;
  const bandHalfWidth = 25; // the band occupies the middle half of the track

  return (
    <div className="relative mt-2.5 h-1.5 w-full rounded-full bg-j-line">
      {/* The tolerance itself. */}
      <div
        className="absolute inset-y-0 rounded-full bg-j-line-strong"
        style={{ left: `${50 - bandHalfWidth}%`, width: `${bandHalfWidth * 2}%` }}
      />
      {/* The reference price. */}
      <div className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-j-faint" />
      {/* Where the curve actually is. */}
      <div
        className={cn(
          "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-j-surface",
          nav.withinBand ? "bg-j-pos" : "bg-j-neg",
        )}
        style={{ left: `${position}%` }}
      />
    </div>
  );
}

/**
 * Where the mark came from, said once and the same way on every branch.
 *
 * It used to appear only when the curve was *inside* its band, so a reader
 * looking at a breach — the case where provenance matters most — was not told
 * whether the number it breached was an on-chain oracle read or a
 * third-party's undated figure.
 */
function Provenance({ nav }: { nav: NavReference }) {
  if (nav.source === "tessera") {
    return (
      <>
        Tessera publishes no timestamp with this mark, so its freshness is
        unknown.
      </>
    );
  }
  return <>Pyth mark from {since(nav.updatedAt)}, read on-chain.</>;
}

function StateBadge({ nav }: { nav: NavReference }) {
  if (nav.state === "stale") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-j-neg">
        <AlertTriangle size={11} aria-hidden="true" />
        Stale — {since(nav.updatedAt)}
      </span>
    );
  }

  if (nav.state === "closed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-j-muted">
        <Clock size={11} aria-hidden="true" />
        Market closed · last close
      </span>
    );
  }

  /*
   * A published mark with no timestamp.
   *
   * This fell through to "Live", which is the strongest possible claim about
   * a number whose age is genuinely unknown: Tessera publishes a price and no
   * time with it. The band's own sentence already said freshness was unknown,
   * so the badge was contradicting the paragraph underneath it.
   */
  if (nav.state === "mark") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-j-muted">
        <Clock size={11} aria-hidden="true" />
        Published mark · no timestamp
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-j-pos">
      <Radio size={11} aria-hidden="true" />
      Live
    </span>
  );
}

/** `Equity.US.AAPL/USD` -> `AAPL`; an unrecognised feed keeps its own name. */
export function feedLabel(feed: string): string {
  const match = /^Equity\.[A-Z]+\.([A-Z.]+)\/USD$/.exec(feed);
  if (match) return match[1];
  const crypto = /^Crypto\.([A-Z]+)\/USD$/.exec(feed);
  if (crypto) return crypto[1];
  return feed.length > 16 ? `${feed.slice(0, 8)}…` : feed;
}
