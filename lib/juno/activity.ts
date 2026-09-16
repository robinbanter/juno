import "server-only";

import { PublicKey } from "@solana/web3.js";

import { getConnection } from "./dbc";
import { identicon } from "./identicon";
import { shortAddress } from "./format";
import type { Activity, Holder } from "./types";

/**
 * Trade history and holders, read from chain.
 *
 * There is no indexer behind Juno, so this is deliberately what the RPC can
 * answer directly rather than a richer feed that would have to be invented:
 * real signatures against the pool, and real token accounts for the mint.
 */

/**
 * Recent transactions touching the pool.
 *
 * Direction and size need the swap event decoded out of the transaction logs,
 * which is indexer work. Until that exists every row reports its signature and
 * timestamp truthfully and leaves amounts null rather than guessing.
 */
export async function listPoolActivity(
  poolAddress: string,
  limit = 20,
): Promise<Activity[]> {
  try {
    const signatures = await getConnection().getSignaturesForAddress(
      new PublicKey(poolAddress),
      { limit },
      "confirmed",
    );

    return signatures
      .filter((entry) => !entry.err)
      .map((entry) => ({
        id: entry.signature,
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
  } catch {
    return [];
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
