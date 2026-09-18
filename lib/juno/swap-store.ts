import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { junoPoolTxs } from "@/lib/db/schema";
import type { Swap } from "./indexer";

/**
 * Postgres persistence for decoded pool transactions.
 *
 * `indexer.ts` decides *what* a transaction was; this only remembers the
 * answer, so a finalized signature is fetched from the RPC once, ever. See
 * `juno_pool_txs` in the schema for why that matters on the public endpoint.
 *
 * No `server-only` marker, for the same reason `indexer.ts` has none: the CLI
 * (`npm run juno:swaps`) runs the same path under tsx and fills the same table.
 * Nothing in the client graph imports this module.
 */

/** A stored transaction: a swap, or a signature known not to be one. */
export type StoredTx = { signature: string; swap: Swap | null };

export type SwapStore = {
  /** Everything stored for the pool, whether or not the RPC still lists it. */
  loadAll(poolAddress: string): Promise<StoredTx[]>;
  save(poolAddress: string, txs: StoredTx[]): Promise<void>;
};

function toStored(row: typeof junoPoolTxs.$inferSelect): StoredTx {
  if (row.kind !== "swap") return { signature: row.signature, swap: null };
  return {
    signature: row.signature,
    swap: {
      signature: row.signature,
      side: row.side === "sell" ? "sell" : "buy",
      baseAmount: row.baseAmount ?? 0,
      quoteAmount: row.quoteAmount ?? 0,
      price: row.price ?? 0,
      trader: row.trader ?? "",
      blockTime: row.blockTime ?? null,
    },
  };
}

export const pgSwapStore: SwapStore = {
  async loadAll(poolAddress) {
    const rows = await getDb()
      .select()
      .from(junoPoolTxs)
      .where(eq(junoPoolTxs.poolAddress, poolAddress));
    return rows.map(toStored);
  },

  async save(poolAddress, txs) {
    if (txs.length === 0) return;
    await getDb()
      .insert(junoPoolTxs)
      .values(
        txs.map(({ signature, swap }) => ({
          poolAddress,
          signature,
          kind: swap ? "swap" : "other",
          side: swap?.side ?? null,
          baseAmount: swap?.baseAmount ?? null,
          quoteAmount: swap?.quoteAmount ?? null,
          price: swap?.price ?? null,
          trader: swap?.trader ?? null,
          blockTime: swap?.blockTime ?? null,
        })),
      )
      // Two renders racing to index the same new trade both land here; the
      // decoded answer is identical, so the second write is simply dropped.
      .onConflictDoNothing();
  },
};
