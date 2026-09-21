import { notFound } from "next/navigation";

import { hydratePools } from "@/lib/juno/chain";
import { identicon } from "@/lib/juno/identicon";
import { shortAddress } from "@/lib/juno/format";
import { listPoolsByCreator } from "@/lib/juno/registry";
import { followStats } from "@/lib/juno/social-graph";
import { loadPortfolio } from "@/lib/juno/portfolio";
import type { Creator } from "@/lib/juno/types";
import { ProfileView } from "./ProfileView";

export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: shortAddress(handle, 4, 4) };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  // A creator is a wallet. Anything else cannot own a pool, so there is
  // nothing to look up.
  if (!BASE58.test(handle)) notFound();

  const rows = await listPoolsByCreator(handle);
  const { coins, missing } = await hydratePools(rows);

  /*
   * Follower counts are a Postgres read, not an unknown.
   *
   * These were pinned to null with the note that a fabricated zero would be
   * worse — correct at the time, because nothing counted them. `followStats`
   * counts them now, cluster-scoped, and has since the social graph landed;
   * leaving the nulls in meant the profile rendered a dash for a figure two
   * indexed queries away. A short read still falls back to null rather than
   * to zero, so the original principle holds: the dash means "not read", and
   * it now only appears when that is true.
   */
  const social = await followStats(handle).catch(() => null);

  /*
   * What this wallet holds and what it has traded.
   *
   * One read feeds both tabs: `loadPortfolio` already walks each pool's swap
   * history to build average cost, and the per-position `trades` it keeps for
   * the value-over-time chart are exactly the fills the activity tab wants.
   * Reading it twice would double a walk that is the slowest thing on the
   * page. It is allowed to fail — a profile without its two secondary tabs is
   * still a profile, and `partial` distinguishes "read nothing" from "holds
   * nothing" in the UI.
   */
  const folio = await loadPortfolio(handle).catch(() => null);

  const positions = (folio?.positions ?? []).map((position) => ({
    baseMint: position.baseMint,
    symbol: position.symbol,
    name: position.name,
    balance: position.balance,
    value: position.value,
    unrealisedPnlPct: position.unrealisedPnlPct,
    currency: position.currency,
  }));

  // Flattened across pools and sorted newest first, so the tab reads as one
  // trading history rather than as a list grouped by coin.
  const trades = (folio?.positions ?? [])
    .flatMap((position) =>
      position.trades.map((trade) => ({
        ...trade,
        symbol: position.symbol,
        baseMint: position.baseMint,
        currency: position.currency,
      })),
    )
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t));

  /*
   * This creator has launches on record that could not be priced.
   *
   * Without the distinction the page rendered "0 Posts", "$0" and "No posts
   * yet" for a wallet with eight pools — the third place in this app where a
   * throttled read was reported as an empty result. Counts come from the
   * registry rows, which are in Postgres and always readable; only the prices
   * depend on the RPC.
   */
  const unreadable = rows.length > 0 && coins.length === 0;

  const creator: Creator = {
    handle,
    displayName: shortAddress(handle, 4, 4),
    avatarUrl: identicon(handle),
    ticker: shortAddress(handle, 4, 4),
    wallet: handle,
    bio: undefined,
    followers: social?.followers ?? null,
    following: social?.following ?? null,
    // The registry knows how many they launched even when nothing prices.
    posts: rows.length,
    // Sum of what this creator has issued — a real figure, not a creator coin.
    marketCap: coins.reduce((sum, coin) => sum + coin.marketCap, 0),
    // Mixed-quote portfolios cannot be summed into one unit honestly; label
    // by the first coin's unit when they all agree, USD otherwise.
    marketCapCurrency:
      new Set(coins.map((c) => c.marketCapCurrency)).size === 1
        ? (coins[0]?.marketCapCurrency ?? "USD")
        : "USD",
    // Never measured for a creator, and 0 would render as a real reading.
    marketCapChangePct: null,
  };

  return (
    <div className="mx-auto w-full max-w-[600px] px-0 pt-4 sm:px-4">
      <ProfileView
        creator={creator}
        coins={coins}
        positions={positions}
        trades={trades}
        portfolioPartial={folio === null || folio.partial}
        unreadable={unreadable}
        missing={missing}
      />
    </div>
  );
}
