import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { junoScanned, junoSwaps } from "@/lib/db/schema";
import { cluster } from "./cluster";
import type { PoolSwap } from "./swaps";

/**
 * Decoded swaps, remembered.
 *
 * The decode itself is unchanged and still the good part: a fill's side and
 * size come out of the pool's own vault deltas, so Juno needs no indexer and
 * no third-party API to know what happened. What changed is that it stops
 * happening twice.
 *
 * Every surface in the app — the chart, the portfolio, the leaderboard, the
 * feed, the crowd figures — walks the same pools, and each walk is a signature
 * listing plus paced pages of `getParsedTransactions` against an endpoint that
 * refuses under load. The result was that a coin with four trades regularly
 * rendered "No trades yet", and a leaderboard built from eleven pools came
 * back having read one.
 *
 * ## This is not a cache of prices
 *
 * Nothing here is derived. Every column is something a confirmed transaction
 * said, keyed by the signature that proves it, so a row can be checked against
 * an explorer. Prices, volumes and P&L are still computed from these rows at
 * read time exactly as before — the chain remains the source of truth and this
 * is a record of what was already read from it.
 *
 * ## Why signatures and not slots
 *
 * The primary key is the signature, so re-reading a page the app already has
 * is a no-op rather than a duplicate. That makes the writer safe to call on
 * every walk, including partial ones: a short read contributes whatever it
 * managed to decode and the rest arrives later.
 */

/** Write what a walk decoded. Idempotent — the signature is the key. */
export async function rememberSwaps(poolAddress: string, swaps: PoolSwap[]): Promise<void> {
  if (swaps.length === 0) return;

  const rows = swaps
    // A fill with no timestamp cannot be placed on a chart's time axis, and
    // `new Date(0)` would put it in 1970 rather than admitting the gap.
    .filter((swap) => Number.isFinite(Date.parse(swap.timestamp)))
    .map((swap) => ({
      signature: swap.signature,
      poolAddress,
      cluster: cluster(),
      side: swap.side,
      baseAmount: swap.baseAmount,
      quoteAmount: swap.quoteAmount,
      price: swap.price,
      trader: swap.trader,
      slot: swap.slot,
      blockTime: new Date(swap.timestamp),
    }));
  if (rows.length === 0) return;

  await getDb().insert(junoSwaps).values(rows).onConflictDoNothing();
}

/** Everything remembered for one pool, newest first. */
export async function recalledSwaps(poolAddress: string, limit = 200): Promise<PoolSwap[]> {
  const rows = await getDb()
    .select()
    .from(junoSwaps)
    .where(and(eq(junoSwaps.poolAddress, poolAddress), eq(junoSwaps.cluster, cluster())))
    .orderBy(desc(junoSwaps.slot))
    .limit(limit);

  return rows.map(toSwap);
}

/**
 * Everything remembered for several pools at once.
 *
 * One query for a whole leaderboard rather than one per pool — the walk it
 * replaces was the reason a rank took twenty seconds and still came back
 * short.
 */
export async function recalledSwapsFor(
  poolAddresses: string[],
  limit = 2_000,
): Promise<Map<string, PoolSwap[]>> {
  const out = new Map<string, PoolSwap[]>();
  if (poolAddresses.length === 0) return out;

  const rows = await getDb()
    .select()
    .from(junoSwaps)
    .where(
      and(eq(junoSwaps.cluster, cluster()), inArray(junoSwaps.poolAddress, poolAddresses)),
    )
    .orderBy(desc(junoSwaps.slot))
    .limit(limit);

  for (const row of rows) {
    const list = out.get(row.poolAddress) ?? [];
    list.push(toSwap(row));
    out.set(row.poolAddress, list);
  }
  return out;
}

/** The newest slot Juno has a record of for this pool, or null. */
export async function highWaterSlot(poolAddress: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ slot: junoSwaps.slot })
    .from(junoSwaps)
    .where(and(eq(junoSwaps.poolAddress, poolAddress), eq(junoSwaps.cluster, cluster())))
    .orderBy(desc(junoSwaps.slot))
    .limit(1);
  return row?.slot ?? null;
}

function toSwap(row: typeof junoSwaps.$inferSelect): PoolSwap {
  return {
    signature: row.signature,
    side: row.side === "sell" ? "sell" : "buy",
    baseAmount: row.baseAmount,
    quoteAmount: row.quoteAmount,
    price: row.price,
    trader: row.trader,
    timestamp: row.blockTime.toISOString(),
    slot: row.slot,
  };
}

/**
 * Merge a chain walk with what was already remembered.
 *
 * Deduplicated by signature with the *fresh* row winning, though in practice
 * they agree — a confirmed transaction does not change. Sorted newest first,
 * which is the order every caller expects.
 */
export function mergeSwaps(recalled: PoolSwap[], fresh: PoolSwap[]): PoolSwap[] {
  const bySignature = new Map<string, PoolSwap>();
  for (const swap of recalled) bySignature.set(swap.signature, swap);
  for (const swap of fresh) bySignature.set(swap.signature, swap);
  return [...bySignature.values()].sort((a, b) => b.slot - a.slot);
}

/* ------------------------------------------------------------------ */
/* Signatures already examined                                         */
/* ------------------------------------------------------------------ */

/**
 * Write down that these signatures were looked at.
 *
 * Called with the whole page, swaps and non-swaps alike. A signature is
 * immutable — if it was not a swap when it confirmed it never will be — so the
 * negative answer is as durable as the positive one, and far more common: most
 * of a pool's history is its own launch transactions.
 */
export async function markScanned(poolAddress: string, signatures: string[]): Promise<void> {
  if (signatures.length === 0) return;
  await getDb()
    .insert(junoScanned)
    .values(
      signatures.map((signature) => ({ signature, poolAddress, cluster: cluster() })),
    )
    .onConflictDoNothing();
}

/** Signatures already examined for this pool, whatever the answer was. */
export async function scannedSignatures(poolAddress: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ signature: junoScanned.signature })
    .from(junoScanned)
    .where(and(eq(junoScanned.poolAddress, poolAddress), eq(junoScanned.cluster, cluster())));
  return new Set(rows.map((row) => row.signature));
}
