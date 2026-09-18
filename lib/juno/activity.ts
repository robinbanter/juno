import "server-only";

import { PublicKey } from "@solana/web3.js";

import { getConnection } from "./dbc";
import { identicon } from "./identicon";
import { shortAddress } from "./format";
import { listSwaps } from "./indexer";
import type { Activity, Holder } from "./types";

/**
 * Trade history and holders, read from chain.
 *
 * Two tiers, and which one you get depends on what the RPC will answer:
 *
 *  1. `lib/juno/indexer.ts` reconstructs each swap — direction, size, price,
 *     trader — from token-balance deltas. This is the real feed.
 *  2. When that read is refused, the signature list alone, which is one cheap
 *     call. Rows then show the transaction and its timestamp and nothing else,
 *     because a direction we did not read is a direction we must not print.
 *
 * Tier 2 is not a placeholder to be removed later. The public devnet endpoint
 * enforces a per-method quota that a dozen transaction fetches can exhaust, so
 * the degraded path is a normal operating state until `NEXT_PUBLIC_SOLANA_RPC`
 * points somewhere dedicated.
 */

/**
 * Recent trades against the pool, newest first.
 *
 * `rate` converts quote units to USD. Pass null when there is no price feed —
 * rows are then labelled in the quote token rather than converted at a rate
 * nobody published, which is the same rule `hydratePool` follows.
 */
export type ActivityRow = Activity & { valueLabel?: string };

/**
 * Trades plus whether the read actually succeeded.
 *
 * `unreadable` exists because "this pool has no trades" and "the RPC would not
 * tell us" both used to come back as `[]`, and the pages rendered both as
 * "Nothing has traded yet" — a false statement during every rate-limit spell.
 */
export type ActivityReport = { rows: ActivityRow[]; unreadable: boolean };

/** Trades only; an unreadable pool looks empty. Prefer `listPoolActivityReport`. */
export async function listPoolActivity(
  poolAddress: string,
  baseMint: string,
  options: { limit?: number; rate?: number | null; quoteSymbol?: string } = {},
): Promise<ActivityRow[]> {
  return (await listPoolActivityReport(poolAddress, baseMint, options)).rows;
}

export async function listPoolActivityReport(
  poolAddress: string,
  baseMint: string,
  options: { limit?: number; rate?: number | null; quoteSymbol?: string } = {},
): Promise<ActivityReport> {
  const { limit = 20, rate = null, quoteSymbol } = options;

  const history = await listSwaps(poolAddress, baseMint);

  if (history && history.swaps.length > 0) {
    const rows: ActivityRow[] = history.swaps.slice(0, limit).map((swap) => ({
      id: swap.signature,
      side: swap.side,
      actor: {
        handle: shortAddress(swap.trader, 4, 4),
        avatarUrl: identicon(swap.trader),
      },
      amount: swap.baseAmount,
      valueUsd: swap.quoteAmount * (rate ?? 1),
      // Without a feed the number is quote units, so say which token it is
      // rather than letting it render behind a dollar sign.
      valueLabel:
        rate === null
          ? `${swap.quoteAmount.toPrecision(3)} ${quoteSymbol ?? ""}`.trim()
          : undefined,
      timestamp: new Date((swap.blockTime ?? 0) * 1000).toISOString(),
      signature: swap.signature,
    }));
    return { rows, unreadable: false };
  }

  // Degraded tier: signatures only.
  try {
    const signatures = await getConnection().getSignaturesForAddress(
      new PublicKey(poolAddress),
      { limit },
      "confirmed",
    );

    const rows: ActivityRow[] = signatures
      .filter((entry) => !entry.err)
      .map((entry) => ({
        id: entry.signature,
        // Never rendered — `amount` and `valueUsd` are both zero, which is how
        // ActivityList knows this row was not decoded and shows the tx link
        // instead of a side.
        side: "buy" as const,
        actor: {
          handle: shortAddress(entry.signature, 4, 4),
          avatarUrl: identicon(entry.signature),
        },
        amount: 0,
        valueUsd: 0,
        timestamp: new Date((entry.blockTime ?? 0) * 1000).toISOString(),
        signature: entry.signature,
      }));
    return { rows, unreadable: false };
  } catch {
    // Both tiers refused. Not "no trades" — we do not know.
    return { rows: [], unreadable: true };
  }
}

/** Largest token accounts for the mint — the top 20 the RPC will return. */
export async function listPoolHolders(baseMint: string): Promise<Holder[]> {
  try {
    const result = await getConnection().getTokenLargestAccounts(
      new PublicKey(baseMint),
      "confirmed",
    );
    const accounts = result.value.filter((a) => (a.uiAmount ?? 0) > 0);
    const total = accounts.reduce((sum, a) => sum + (a.uiAmount ?? 0), 0);

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
  } catch {
    return [];
  }
}
