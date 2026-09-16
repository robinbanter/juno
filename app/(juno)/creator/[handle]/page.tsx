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

  const creator: Creator = {
    handle,
    displayName: shortAddress(handle, 4, 4),
    avatarUrl: identicon(handle),
    ticker: shortAddress(handle, 4, 4),
    wallet: handle,
    bio: undefined,
    followers: 0,
    following: 0,
    posts: coins.length,
    // Sum of what this creator has issued — a real figure, not a creator coin.
    marketCap: coins.reduce((sum, coin) => sum + coin.marketCap, 0),
    // Mixed-quote portfolios cannot be summed into one unit honestly; label
    // by the first coin's unit when they all agree, USD otherwise.
    marketCapCurrency:
      new Set(coins.map((c) => c.marketCapCurrency)).size === 1
        ? (coins[0]?.marketCapCurrency ?? "USD")
        : "USD",
    marketCapChangePct: 0,
  };

  return (
    <div className="mx-auto w-full max-w-[600px] px-0 pt-4 sm:px-4">
      <ProfileView creator={creator} coins={coins} />
    </div>
  );
}
