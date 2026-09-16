import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { usd } from "@/lib/juno/format";
import { DEMO_ALL } from "@/lib/juno/mock";
import type { Coin } from "@/lib/juno/types";
import { CurveProgressBar } from "@/components/juno/coin/CurveProgress";
import { Avatar } from "@/components/juno/ui/Avatar";
import { Delta } from "@/components/juno/ui/Delta";

export const metadata = { title: "Explore" };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { q, sort } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";

  let coins: Coin[] = DEMO_ALL;
  if (query) {
    coins = coins.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.symbol.toLowerCase().includes(query) ||
        c.creator.handle.toLowerCase().includes(query),
    );
  }
  // "Trending" is 24h volume, not market cap — a big coin that nobody traded
  // today is not trending, it is just big.
  coins =
    sort === "trending"
      ? [...coins].sort((a, b) => b.volume24h - a.volume24h)
      : coins;

  const heading = query
    ? `${coins.length} result${coins.length === 1 ? "" : "s"} for “${q}”`
    : sort === "trending"
      ? "Trending"
      : "Latest";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 lg:px-8">
      <div className="mb-5 flex items-baseline gap-4">
        <h1 className="text-[22px] font-bold tracking-tight">{heading}</h1>
        {!query && (
          <nav className="flex gap-3 text-[14px]">
            <SortLink href="/explore" label="Latest" active={sort !== "trending"} />
            <SortLink
              href="/explore?sort=trending"
              label="Trending"
              active={sort === "trending"}
            />
          </nav>
        )}
      </div>

      {coins.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-j-faint">
          Nothing matches “{q}”.
        </p>
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

function SortLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
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
  // Reels open in the swipe feed; posts open on their coin page.
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
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Avatar src={coin.creator.avatarUrl} alt={coin.creator.handle} size={18} />
        <span className="truncate text-[13px] font-medium">{coin.name}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px]">
        <Delta value={coin.marketCap} direction={coin.marketCapChangePct} />
        <span className="text-j-faint">{usd(coin.volume24h)} vol</span>
      </div>
    </Link>
  );
}
