import "server-only";

import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { getConnection } from "./dbc";
import { collect, ttlCache, withRetry } from "./rpc";
import {
  markScanned,
  mergeSwaps,
  recalledSwaps,
  rememberSwaps,
  scannedSignatures,
} from "./swap-store";
import type { PricePoint } from "./types";

/**
 * Swap history, decoded from the pool's own vaults.
 *
 * The obvious way to read a market's trades is an indexer over the program's
 * swap events, and Juno has no indexer. It does not need one. Every swap moves
 * the pool's two vault token accounts in opposite directions, and those deltas
 * are in `meta.pre/postTokenBalances` of the transaction the RPC already
 * returns. The vaults are the counterparty to every trade, so their movement
 * *is* the trade — exact amounts, no log parsing, no event decoding, no
 * heuristics about who the signer was.
 *
 * Reading the vaults rather than the trader's own accounts matters for a
 * specific reason: when the quote token is wrapped SOL the trader's side of the
 * trade is split across a temporary WSOL account and a native balance change
 * that also absorbs rent and the transaction fee. The vault sees one clean
 * number.
 *
 * Direction follows from the signs and cannot be mistaken:
 *
 *   base vault down, quote vault up  -> the pool sold base   -> BUY
 *   base vault up,   quote vault down -> the pool bought base -> SELL
 *
 * Anything that is not a swap fails that test and is dropped: pool creation
 * moves base in with no quote leg, a fee claim moves quote out with no base
 * leg, and migration drains both vaults the same way.
 */

export type PoolSwap = {
  signature: string;
  side: "buy" | "sell";
  /** Base tokens that changed hands, in UI units. */
  baseAmount: number;
  /** Quote tokens that changed hands, in UI units. */
  quoteAmount: number;
  /** Realised price of this trade, in quote per base. */
  price: number;
  /** Fee payer — whoever signed the swap. */
  trader: string;
  timestamp: string;
  slot: number;
};

export type PoolVaults = {
  baseVault: string;
  quoteVault: string;
  baseDecimals: number;
  quoteDecimals: number;
};

/**
 * Transactions are fetched in small batches, paced apart.
 *
 * `getParsedTransactions` sends one JSON-RPC batch, which looks like the
 * obvious win — one round trip instead of twenty-five. The public devnet
 * endpoint disagrees: a batch of twenty-five is refused outright with
 * "Too many requests for a specific RPC call", and it stays refused, because
 * that is a per-method policy rather than a burst the caller can wait out.
 * Retrying cannot fix a rule.
 *
 * Five is the size that survives, and `CHUNK_GAP_MS` between chunks keeps a
 * page's worth of reads under the same rule. Slower than one batch and the only
 * version that returns data without a paid endpoint.
 */
const BATCH = 5;
const CHUNK_GAP_MS = 120;

/**
 * Kept deliberately small: a coin page shows recent trades, not an archive, and
 * every extra page is another chance for the endpoint to start refusing.
 */
const DEFAULT_LIMIT = 40;

function addressAt(tx: ParsedTransactionWithMeta, index: number): string | null {
  const keys = tx.transaction.message.accountKeys;
  const key = keys[index];
  if (key) return key.pubkey.toString();
  // Address-table lookups land after the static keys, in load order.
  const loaded = tx.meta?.loadedAddresses;
  if (!loaded) return null;
  const extra = [...loaded.writable, ...loaded.readonly];
  return extra[index - keys.length]?.toString() ?? null;
}

/**
 * Raw-unit change in one specific token account across a transaction.
 *
 * Matched by account address rather than by owner: a pool's vaults and a
 * trader's ATA can share neither address nor purpose, but owners are not
 * unique — the same wallet can hold several accounts for one mint.
 */
type TokenBalances = NonNullable<ParsedTransactionWithMeta["meta"]>["preTokenBalances"];

function vaultDelta(tx: ParsedTransactionWithMeta, vault: string): bigint | null {
  const read = (list: TokenBalances) => {
    for (const balance of list ?? []) {
      if (addressAt(tx, balance.accountIndex) === vault) {
        return BigInt(balance.uiTokenAmount.amount);
      }
    }
    return null;
  };

  const before = read(tx.meta?.preTokenBalances);
  const after = read(tx.meta?.postTokenBalances);
  // A vault absent from both sides means this transaction never touched it.
  if (before === null && after === null) return null;
  return (after ?? 0n) - (before ?? 0n);
}

function scale(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/** Decode one transaction, or null when it is not a swap against this pool. */
export function decodeSwap(
  tx: ParsedTransactionWithMeta,
  vaults: PoolVaults,
): PoolSwap | null {
  if (tx.meta?.err) return null;

  const base = vaultDelta(tx, vaults.baseVault);
  const quote = vaultDelta(tx, vaults.quoteVault);
  if (base === null || quote === null) return null;
  if (base === 0n || quote === 0n) return null;

  // Both legs moving the same way is not a trade — that is a mint, a drain or
  // a migration.
  const isBuy = base < 0n && quote > 0n;
  const isSell = base > 0n && quote < 0n;
  if (!isBuy && !isSell) return null;

  const baseAmount = scale(base < 0n ? -base : base, vaults.baseDecimals);
  const quoteAmount = scale(quote < 0n ? -quote : quote, vaults.quoteDecimals);
  if (baseAmount <= 0 || quoteAmount <= 0) return null;

  const signature = tx.transaction.signatures[0] ?? "";
  return {
    signature,
    side: isBuy ? "buy" : "sell",
    baseAmount,
    quoteAmount,
    price: quoteAmount / baseAmount,
    trader: addressAt(tx, 0) ?? "",
    timestamp: new Date((tx.blockTime ?? 0) * 1000).toISOString(),
    slot: tx.slot,
  };
}

export type SwapHistory = {
  swaps: PoolSwap[];
  /**
   * True when part of the history could not be read. Callers that publish a
   * total — volume, a chart's range — need to know they are summing a subset,
   * because a short read looks exactly like a quiet market otherwise.
   */
  partial: boolean;
};

/**
 * History is cached for a minute.
 *
 * Longer than the five seconds a pool snapshot gets, and for a different
 * reason: a snapshot is one cheap read, while a history is a dozen paced ones
 * against an endpoint that starts refusing. A trade that just landed is still
 * shown immediately — `invalidateSwapHistory` runs on the way back from a swap.
 */
const HISTORY_TTL_MS = 60_000;
/** How long a throttled, incomplete read is reused before trying again. */
const PARTIAL_TTL_MS = 8_000;
const historyCache = ttlCache<SwapHistory>(HISTORY_TTL_MS);

/**
 * Every swap the RPC can still see for this pool, newest first.
 *
 * Signature listing is retried, because without it there is nothing at all to
 * report. The per-chunk reads are retried and then tolerated: one throttled
 * page of twenty-five must not discard the pages that came back, so a failure
 * there marks the history partial instead of emptying it.
 */
export async function listSwapHistory(
  poolAddress: string,
  vaults: PoolVaults,
  limit = DEFAULT_LIMIT,
): Promise<SwapHistory> {
  return historyCache.get(
    `${poolAddress}:${limit}`,
    async () => {
      const connection = getConnection();

      /*
       * What Juno already decoded for this pool.
       *
       * Read first, and it decides what a failure means. A signature listing
       * that the endpoint refuses used to empty the history; with a record to
       * fall back on it returns what is known and marks the read partial,
       * which is the difference between a chart disappearing and a chart being
       * a few minutes behind.
       */
      const [recalled, scanned] = await Promise.all([
        recalledSwaps(poolAddress, limit).catch(() => [] as PoolSwap[]),
        scannedSignatures(poolAddress).catch(() => new Set<string>()),
      ]);

      let candidates: string[];
      try {
        const signatures = await withRetry(() =>
          connection.getSignaturesForAddress(new PublicKey(poolAddress), { limit }, "confirmed"),
        );
        candidates = signatures.filter((entry) => !entry.err).map((entry) => entry.signature);
      } catch {
        return { swaps: recalled, partial: true };
      }

      if (candidates.length === 0) {
        // The listing succeeded and found nothing. If we remember fills, the
        // endpoint has forgotten them rather than them not having happened —
        // devnet prunes history, and a pruned pool is not an untraded one.
        return { swaps: recalled, partial: recalled.length > 0 };
      }

      /*
       * Only fetch what is not already known.
       *
       * This is the whole point: a pool with forty fills used to cost two
       * pages of `getParsedTransactions` on every single read by every single
       * surface. Now it costs one signature listing, and the parsed pages only
       * for signatures nobody has decoded yet — which on a quiet pool is none.
       */
      /*
       * Everything already looked at, whatever the answer was.
       *
       * Filtering on decoded *swaps* alone was a bug with a long tail: a
       * pool's own launch transactions are never swaps, so they were fetched
       * and parsed on every read forever. On a pool with no trades that is a
       * permanent toll paid to learn nothing, and it is why the same pools
       * came back short pass after pass.
       */
      const unknown = candidates.filter(
        (signature) => !scanned.has(signature),
      );

      if (unknown.length === 0) return { swaps: recalled, partial: false };

      /* Signatures whose page actually returned — see `markScanned`. */
      const examined: string[] = [];

      const chunks: string[][] = [];
      for (let i = 0; i < unknown.length; i += BATCH) {
        chunks.push(unknown.slice(i, i + BATCH));
      }

      const { items, partial } = await collect(
        chunks,
        async (chunk) => {
          const parsed = await connection.getParsedTransactions(chunk, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          // Pace the next chunk. The endpoint's per-method limit is about rate,
          // not concurrency, so the gap is what keeps the following chunk legal.
          await new Promise((resolve) => setTimeout(resolve, CHUNK_GAP_MS));
          // Every signature in a page that came back has now been examined,
          // including the ones that turned out not to be swaps.
          chunk.forEach((signature) => examined.push(signature));
          return parsed
            .map((tx) => (tx ? decodeSwap(tx, vaults) : null))
            .filter((swap): swap is PoolSwap => swap !== null);
        },
        { attempts: 4, baseDelayMs: 400, maxDelayMs: 3_000 },
      );

      // Write down what was decoded, then answer from everything known. The
      // write is allowed to fail: a database hiccup should cost the *record*,
      // not the reading the user asked for.
      await Promise.all([
        rememberSwaps(poolAddress, items).catch(() => undefined),
        // Only the pages that actually came back. A chunk the endpoint refused
        // must not be recorded as examined, or its trades are lost for good.
        markScanned(poolAddress, examined).catch(() => undefined),
      ]);

      return { swaps: mergeSwaps(recalled, items), partial };
    },
    // A complete read holds for a minute. A partial one is a symptom of
    // throttling, so it is trusted only briefly — long enough that the same
    // page's second read of the same history is a cache hit rather than
    // another refused call, short enough to retry while the user is still
    // looking at the screen.
    (history) => (history.partial ? PARTIAL_TTL_MS : HISTORY_TTL_MS),
  );
}

/** Drop a pool's cached history — call after a trade so the next read is live. */
export function invalidateSwapHistory(poolAddress: string): void {
  historyCache.invalidate(`${poolAddress}:`);
}

/** Convenience for callers that do not care whether the read was complete. */
export async function listPoolSwaps(
  poolAddress: string,
  vaults: PoolVaults,
  limit = DEFAULT_LIMIT,
): Promise<PoolSwap[]> {
  return (await listSwapHistory(poolAddress, vaults, limit)).swaps;
}

/* ------------------------------------------------------------------ */
/* Derived series                                                      */
/* ------------------------------------------------------------------ */

/**
 * Traded quote volume inside a window, in quote units.
 *
 * Null rather than 0 when there is no history at all to measure against —
 * an empty read and a genuinely quiet day are different claims, and only one
 * of them is ours to make.
 */
export function volumeWithin(
  swaps: PoolSwap[],
  windowMs: number,
  now = Date.now(),
): number | null {
  if (swaps.length === 0) return null;
  let total = 0;
  for (const swap of swaps) {
    const at = Date.parse(swap.timestamp);
    if (Number.isFinite(at) && now - at <= windowMs) total += swap.quoteAmount;
  }
  return total;
}

/** Total traded quote volume across everything we can see. */
export function totalVolume(swaps: PoolSwap[]): number | null {
  if (swaps.length === 0) return null;
  return swaps.reduce((sum, swap) => sum + swap.quoteAmount, 0);
}

export type { PricePoint };

/**
 * Realised price over time, oldest first — the series a chart draws.
 *
 * These are executed prices, not marks: each point is a trade that happened at
 * that price, which is why a flat stretch means nobody traded rather than a
 * price that held. Size rides along so the chart can aggregate the series into
 * candles with real volume rather than counting trades.
 */
export function priceSeries(swaps: PoolSwap[]): PricePoint[] {
  return [...swaps]
    .sort((a, b) => a.slot - b.slot)
    .map((swap) => ({
      t: swap.timestamp,
      price: swap.price,
      volume: swap.quoteAmount,
      side: swap.side,
    }));
}

/**
 * Price change across a window, as a signed ratio.
 *
 * Null when there is no trade old enough to compare against — a market whose
 * entire history is inside the window has no "before" to measure from, and a
 * 0% change would be a claim about a period we cannot see.
 */
export function changeWithin(
  swaps: PoolSwap[],
  windowMs: number,
  currentPrice: number,
  now = Date.now(),
): number | null {
  if (swaps.length === 0 || currentPrice <= 0) return null;

  const ordered = [...swaps].sort((a, b) => a.slot - b.slot);
  // The last trade at or before the window opened is the reference.
  let reference: number | null = null;
  for (const swap of ordered) {
    const at = Date.parse(swap.timestamp);
    if (Number.isFinite(at) && now - at > windowMs) reference = swap.price;
  }
  if (reference === null || reference <= 0) return null;

  return (currentPrice - reference) / reference;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
