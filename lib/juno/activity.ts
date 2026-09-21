import "server-only";

import { PublicKey } from "@solana/web3.js";

import { getConnection } from "./dbc";
import { identicon } from "./identicon";
import { shortAddress } from "./format";
import { tryRead } from "./rpc";
import { listSwapHistory, type PoolSwap, type PoolVaults } from "./swaps";
import type { Activity, Holder } from "./types";

/**
 * Trade history and holders, read from chain.
 *
 * There is no indexer behind Juno and it turns out not to need one. Swap
 * direction and size come out of the pool's own vault deltas — see
 * `lib/juno/swaps.ts` — so a row here reports what actually happened rather
 * than a signature with the details left blank.
 *
 * This previously labelled every row a "buy" with a zero amount, because the
 * direction was believed to require decoding the program's swap event. A
 * trading feed that asserts a side it never read is worse than one that admits
 * it does not know, and it was doing the first of those.
 */

function actorFor(wallet: string): Activity["actor"] {
  return {
    handle: shortAddress(wallet, 4, 4),
    avatarUrl: identicon(wallet),
  };
}

export function activityFromSwap(swap: PoolSwap, quoteUsdRate: number): Activity {
  return {
    id: swap.signature,
    side: swap.side,
    actor: actorFor(swap.trader),
    wallet: swap.trader,
    amount: swap.baseAmount,
    valueUsd: swap.quoteAmount * quoteUsdRate,
    timestamp: swap.timestamp,
    signature: swap.signature,
  };
}

/**
 * Recent trades against the pool, newest first.
 *
 * `quoteUsdRate` converts the quote leg into the unit the row is labelled in.
 * Pass 1 for a pool quoted in a stablecoin, or when no USD price is available —
 * the caller is the one that knows whether it can honestly say "dollars", and
 * `Coin.marketCapCurrency` is how that is carried to the UI.
 */
export async function listPoolActivity(
  poolAddress: string,
  vaults: PoolVaults,
  quoteUsdRate = 1,
  limit = 20,
): Promise<Activity[]> {
  const history = await listSwapHistory(poolAddress, vaults);
  return history.swaps.slice(0, limit).map((swap) => activityFromSwap(swap, quoteUsdRate));
}

/**
 * Largest token accounts for the mint — the top 20 the RPC will return.
 *
 * The public endpoint refuses `getTokenLargestAccounts` outright when it is
 * busy, so this degrades to an empty list. Callers that publish a *count* use
 * `hydratePool`, which distinguishes a refusal from a genuinely empty book.
 */
export async function listPoolHolders(baseMint: string): Promise<Holder[] | null> {
  const result = await tryRead(() =>
    getConnection().getTokenLargestAccounts(new PublicKey(baseMint), "confirmed"),
  );
  // Null, not []. `getTokenLargestAccounts` is one of the calls the public
  // endpoint refuses by method rather than by rate, so this path is the common
  // one — and returning an empty list here made "No holders yet" the standard
  // rendering for pools with holders.
  if (!result) return null;

  const accounts = result.value.filter((account) => (account.uiAmount ?? 0) > 0);
  const total = accounts.reduce((sum, account) => sum + (account.uiAmount ?? 0), 0);

  return accounts.map((account, index) => ({
    rank: index + 1,
    actor: {
      handle: shortAddress(account.address.toBase58(), 4, 4),
      avatarUrl: identicon(account.address.toBase58()),
    },
    wallet: account.address.toBase58(),
    balance: account.uiAmount ?? 0,
    share: total > 0 ? (account.uiAmount ?? 0) / total : 0,
  }));
}
