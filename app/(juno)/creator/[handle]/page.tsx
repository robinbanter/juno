import { notFound } from "next/navigation";

import { hydratePools } from "@/lib/juno/chain";
import { identicon } from "@/lib/juno/identicon";
import { shortAddress } from "@/lib/juno/format";
import { listPoolsByCreator } from "@/lib/juno/registry";
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
  const coins = await hydratePools(rows);

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
    followers: null,
    following: null,
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
      <ProfileView creator={creator} coins={coins} unreadable={unreadable} />
    </div>
  );
}
