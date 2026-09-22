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
 * Who holds this coin, and how that was worked out.
 *
 * `source` is part of the answer rather than an implementation detail, because
 * the two routes measure genuinely different things and the UI has to say
 * which one it is showing.
 */
export type HolderBook = {
  holders: Holder[];
  /**
   * `accounts` — every token account holding the mint, whoever they are and
   * however they got there. The complete picture.
   *
   * `fills` — net position per wallet, rebuilt from the swaps decoded off this
   * pool's own vaults. Sees only wallets that traded *here*, so a holder who
   * received tokens by transfer is invisible to it, and it cannot see anything
   * older than the walked history window.
   */
  source: "accounts" | "fills";
};

/**
 * Largest token accounts for the mint — the top 20 the RPC will return.
 *
 * The public endpoint refuses `getTokenLargestAccounts` outright when it is
 * busy, which on devnet is most of the time, so this used to be the whole
 * story and the Holders tab was permanently empty. It falls back to the fills
 * now: every buy and sell against this pool is already decoded from vault
 * deltas and carries the wallet that signed it, which is enough to rebuild a
 * net position per wallet without asking the endpoint for a method it will not
 * serve.
 *
 * Null only when neither route produced anything — a refusal *and* no readable
 * history. Callers that publish a count still need that distinction, because
 * "nobody holds this" and "nobody could read it" are different claims.
 */
export async function listPoolHolders(
  baseMint: string,
  /** This pool's decoded fills, when the caller already has them. */
  swaps?: PoolSwap[] | null,
): Promise<HolderBook | null> {
  const result = await tryRead(() =>
    getConnection().getTokenLargestAccounts(new PublicKey(baseMint), "confirmed"),
  );

  if (result) {
    const accounts = result.value.filter((account) => (account.uiAmount ?? 0) > 0);
    const total = accounts.reduce((sum, account) => sum + (account.uiAmount ?? 0), 0);

    if (accounts.length > 0) {
      return {
        source: "accounts",
        holders: accounts.map((account, index) => ({
          rank: index + 1,
          /*
           * The owner, not the token account.
           *
           * `getTokenLargestAccounts` returns *token account* addresses, and
           * this used to publish one as `wallet` — so a holder would have been
           * listed under an address that is not theirs, with an identicon that
           * did not match the avatar the same person carries everywhere else
           * in this app. The bug never showed because the call is almost
           * always refused; resolving each owner costs twenty more reads from
           * an endpoint that is already refusing this one, so the account is
           * labelled as what it is.
           */
          actor: {
            handle: shortAddress(account.address.toBase58(), 4, 4),
            avatarUrl: identicon(account.address.toBase58()),
          },
          wallet: account.address.toBase58(),
          isTokenAccount: true,
          balance: account.uiAmount ?? 0,
          share: total > 0 ? (account.uiAmount ?? 0) / total : 0,
        })),
      };
    }
  }

  const derived = swaps ? holdersFromSwaps(swaps) : [];
  if (derived.length > 0) return { source: "fills", holders: derived };

  // Null, not []. Returning an empty list here made "No holders yet" the
  // standard rendering for pools that plainly have holders.
  return null;
}

/**
 * Net position per wallet, from this pool's own decoded fills.
 *
 * Buys add, sells subtract, and anything that nets to zero or below is gone —
 * a wallet that sold everything is not a holder. Ranked by size, which is the
 * same order `getTokenLargestAccounts` would have given.
 *
 * These are real wallets, the ones that signed the swaps, which makes this
 * list more useful than the token accounts it stands in for even though it is
 * less complete.
 */
export function holdersFromSwaps(swaps: PoolSwap[]): Holder[] {
  const net = new Map<string, number>();
  for (const swap of swaps) {
    const delta = swap.side === "buy" ? swap.baseAmount : -swap.baseAmount;
    net.set(swap.trader, (net.get(swap.trader) ?? 0) + delta);
  }

  const held = [...net.entries()]
    .filter(([, balance]) => balance > 0)
    .sort((a, b) => b[1] - a[1]);

  // Share is of what this list accounts for, not of circulating supply, which
  // these fills cannot see.
  const total = held.reduce((sum, [, balance]) => sum + balance, 0);

  return held.map(([wallet, balance], index) => ({
    rank: index + 1,
    actor: { handle: shortAddress(wallet, 4, 4), avatarUrl: identicon(wallet) },
    wallet,
    balance,
    share: total > 0 ? balance / total : 0,
  }));
}
