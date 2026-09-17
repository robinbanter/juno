import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { hydratePools } from "@/lib/juno/chain";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import { cluster } from "@/lib/juno/cluster";
import { usd } from "@/lib/juno/format";
import { listPools } from "@/lib/juno/registry";
import type { Coin } from "@/lib/juno/types";
import { listSwaps, volume24h } from "@/lib/juno/indexer";
import { CurveProgressBar } from "@/components/juno/coin/CurveProgress";
import { Volume24h } from "@/components/juno/Volume24h";
import { Avatar } from "@/components/juno/ui/Avatar";
import { Delta } from "@/components/juno/ui/Delta";

/**
 * How many pools the trending sort will read swap history for.
 *
 * Each one is a sequential walk of that pool's transactions, so this is a
 * latency and rate-limit budget, not a display limit.
 */
const TRENDING_LIMIT = 12;

export const metadata = { title: "Explore" };
// Every figure is read live from the DBC program on each request.
export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { q, sort } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";

  let coins: Coin[] = await hydratePools(await listPools());

  if (query) {
    coins = coins.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query) ||
        c.creator.handle.toLowerCase().includes(query),
    );
  }
  if (sort === "trending") {
    // Ranking by volume needs the volume, and that is a per-transaction walk
    // per pool — far too expensive to do on every page view. So it happens
    // only when the user actually asks to rank by it, sequentially (the RPC
    // quota does not survive a burst), and capped.
    //
    // `listSwaps` caches per pool, so a visitor who came from a coin page gets
    // some of these for free. Any pool whose read is refused keeps a null
    // volume and sorts last — unknown is not zero.
    const ranked = coins.slice(0, TRENDING_LIMIT);
    for (const coin of ranked) {
      coin.volume24h = volume24h(await listSwaps(coin.pool, coin.address));
    }
    coins = [...coins].sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1));
  } else if (sort === "graduating") {
    // Closest to migration first. A pool that has already graduated is done,
    // so it drops to the bottom rather than topping a list about what is next.
    coins = [...coins].sort((a, b) => {
      const rank = (c: Coin) => (c.curve.graduated ? -1 : c.curve.progress);
      return rank(b) - rank(a);
    });
  }

  const heading = query
    ? `${coins.length} result${coins.length === 1 ? "" : "s"} for “${q}”`
    : sort === "trending"
      ? "Trending"
      : sort === "graduating"
        ? "Closest to graduating"
        : "Latest";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 lg:px-8">
      <div className="mb-5 flex items-baseline gap-4">
        <h1 className="text-[22px] font-bold tracking-tight">{heading}</h1>
        {!query && (
          <nav className="flex gap-3 text-[14px]">
            <SortLink href="/explore" label="Latest" active={sort !== "trending"} />
            <SortLink href="/explore?sort=trending" label="Trending" active={sort === "trending"} />
            <SortLink
              href="/explore?sort=graduating"
              label="Graduating"
              active={sort === "graduating"}
            />
          </nav>
        )}
      </div>

      {coins.length === 0 ? (
        <EmptyState query={q} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {coins.map((coin) => (
            <li key={coin.address}>
              <CoinTile coin={coin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ query }: { query?: string }) {
  if (query) {
    return (
      <p className="py-20 text-center text-[14px] text-j-faint">
        Nothing matches “{query}”.
      </p>
    );
  }
  return (
    <div className="py-20 text-center">
      <p className="text-[15px] font-semibold">No coins yet on {cluster()}</p>
      <p className="mt-1 text-[14px] text-j-muted">
        Every coin here is a live Meteora bonding-curve pool.
      </p>
      <Link
        href="/create"
        className="mt-4 inline-flex h-11 items-center rounded-full bg-j-pos px-5 text-[15px] font-semibold text-j-bg"
      >
        Launch the first one
      </Link>
    </div>
  );
}

function SortLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={active ? "font-semibold text-j-ink" : "text-j-muted hover:text-j-ink"}
    >
      {label}
    </Link>
  );
}

function CoinTile({ coin }: { coin: Coin }) {
  const href = coin.format === "reel" ? "/reels" : `/coin/${coin.address}`;

  return (
    <Link
      href={href}
      className="group block rounded-j-lg focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
    >
      <div className="relative overflow-hidden rounded-j-lg bg-j-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coin.media.posterUrl ?? coin.media.url}
          alt={coin.name}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {coin.format === "reel" && (
          <span
            className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm"
            aria-label="Reel"
          >
            <Clapperboard size={11} />
            Reel
          </span>
        )}
        <CurveProgressBar curve={coin.curve} />

        {/* Which curve this launched on — the choice that shapes the market. */}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {CURVE_PRESETS[coin.curvePreset]?.label ?? coin.curvePreset}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Avatar src={coin.creator.avatarUrl} alt={coin.creator.handle} size={18} />
        <span className="truncate text-[13px] font-medium">{coin.name}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px]">
        <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />
        <span className="text-j-faint tabular-nums">
          {coin.curve.graduated
            ? "graduated"
            : `${Math.round(coin.curve.progress * 100)}% to graduation`}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-j-faint">
        <span>24h</span>
        <Volume24h pool={coin.pool} mint={coin.address} quoteSymbol={coin.quote.symbol} />
      </div>
    </Link>
  );
}
