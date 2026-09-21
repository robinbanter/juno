import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { hydratePools } from "@/lib/juno/chain";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import { cluster } from "@/lib/juno/cluster";
import { usd } from "@/lib/juno/format";
import { listPools } from "@/lib/juno/registry";
import type { Coin } from "@/lib/juno/types";
import { CurveProgressBar } from "@/components/juno/coin/CurveProgress";
import { Avatar } from "@/components/juno/ui/Avatar";
import { Delta } from "@/components/juno/ui/Delta";

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

  const rows = await listPools();
  const read = await hydratePools(rows);
  let coins: Coin[] = read.coins;

  // The registry holding rows while nothing hydrates means the reads failed,
  // not that the market is empty. Those are different claims and only one of
  // them is ours to make — on a public RPC a burst of 429s produces exactly
  // this, and "no coins yet" would be a confident lie about a busy cluster.
  const unreadable = rows.length > 0 && coins.length === 0;

  // The same lie, one size smaller: eleven rows in and nine tiles out is a
  // grid that presents itself as the whole market while two coins are simply
  // absent. The count is stated rather than quietly dropped.
  const missing = read.missing;

  if (query) {
    coins = coins.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query) ||
        c.creator.handle.toLowerCase().includes(query),
    );
  }
  if (sort === "trending") {
    // Coins with unknown volume sort last rather than being treated as zero.
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

      {missing > 0 && coins.length > 0 && (
        <p className="mb-3 rounded-j border border-j-line bg-j-surface px-3 py-2 text-[12px] text-j-muted">
          {missing} more {missing === 1 ? "coin is" : "coins are"} listed on this
          cluster but could not be priced — the RPC is rate-limiting. Reload to
          try again.
        </p>
      )}

      {coins.length === 0 ? (
        <EmptyState query={q} unreadable={unreadable} />
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

function EmptyState({ query, unreadable }: { query?: string; unreadable?: boolean }) {
  if (query) {
    return (
      <p className="py-20 text-center text-[14px] text-j-faint">
        Nothing matches “{query}”.
      </p>
    );
  }
  if (unreadable) {
    return (
      <div className="py-20 text-center">
        <p className="text-[15px] font-semibold">Could not read the market</p>
        <p className="mx-auto mt-1 max-w-sm text-[14px] text-j-muted">
          There are pools on {cluster()}, but the RPC would not serve them just
          now. Juno runs on the public endpoint, which rate-limits. Try again in
          a moment.
        </p>
      </div>
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
        {/* The ticker is how anyone actually refers to a coin, and a market
            grid without it makes the reader open a tile to find out. */}
        <span className="shrink-0 text-[11px] font-semibold tracking-wide text-j-faint tabular-nums">
          ${coin.symbol}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px]">
        <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />
        <span className="text-j-faint tabular-nums">
          {coin.curve.graduated
            ? "graduated"
            : `${Math.round(coin.curve.progress * 100)}% to graduation`}
        </span>
      </div>
    </Link>
  );
}
