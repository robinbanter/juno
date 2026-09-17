import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { getConnection } from "./dbc";

/**
 * Swap history for a DBC pool, read straight from the RPC.
 *
 * There is no external indexer behind Juno and there is not going to be one
 * before the deadline, so this is the honest middle ground: signatures against
 * the pool, then the parsed transactions, then the trade reconstructed from
 * token-balance deltas.
 *
 * ## Why balance deltas rather than the program's logs
 *
 * The obvious approach is to decode the DBC swap event out of `logMessages`.
 * That needs the event discriminator and the Anchor layout, and it breaks
 * silently the moment Meteora changes either. Pre/post token balances are
 * consensus data the validator produces for every transaction, they are
 * already in the response we have to fetch anyway, and they cannot drift out
 * of sync with what actually moved.
 *
 * The pool's two vaults are token accounts under one authority PDA, so that
 * authority is the only owner in a swap holding *both* the base and the quote
 * mint. Find it, and the trade falls out:
 *
 *   quote into the vault, base out   → a buy
 *   quote out of the vault, base in  → a sell
 *
 * This also self-filters. Pool creation moves base into the vault with no
 * quote leg, and fee claims and migration move quote with no base leg — both
 * come out with a zero on one side and are rejected as non-swaps, which is
 * why the pool's own creation transaction never appears as a trade.
 *
 * ## Rate limits
 *
 * The public devnet endpoint is what this runs against unless
 * `NEXT_PUBLIC_SOLANA_RPC` is set, and it rate-limits hard. Every read here is
 * batched into as few round trips as possible and cached in-process, and
 * **every failure path returns `null`, never `[]`**. That distinction carries
 * all the way to the UI: `null` means "we could not read it" and renders an
 * em-dash, `[]` means "we read it and there are no trades" and renders a zero.
 * Rendering a rate-limited read as a confident `$0` would be a lie on a
 * trading screen.
 *
 * No `server-only` marker, deliberately, and for the same reason `dbc.ts` has
 * none: this module's only dependency is an RPC `Connection`, so the CLI in
 * `scripts/juno-swaps.ts` can import it directly under tsx. The modules that
 * do carry the marker — `registry.ts`, `social.ts`, `activity.ts` — carry it
 * because they hold database credentials, which this one never touches.
 */

export type Swap = {
  signature: string;
  side: "buy" | "sell";
  /** Coin amount, UI units, always positive. */
  baseAmount: number;
  /** Quote amount, UI units, always positive. */
  quoteAmount: number;
  /** Quote per base at execution. */
  price: number;
  /** Fee payer — the wallet that signed the swap. */
  trader: string;
  /** Unix seconds. Null when the validator did not record one. */
  blockTime: number | null;
};

/** A point on the price chart. */
export type PricePoint = {
  /** Unix milliseconds. */
  t: number;
  /** Quote per base. */
  price: number;
};

/**
 * How many signatures to walk back per pool.
 *
 * `getSignaturesForAddress` will return up to 1000, but every one of them
 * becomes a transaction fetch, and those are the expensive part. 60 covers the
 * entire history of every pool Juno has launched; on a busier pool it is a
 * window, and `SwapHistory.truncated` says so rather than pretending otherwise.
 */
const SIGNATURE_LIMIT = 60;

/**
 * Gap between transaction fetches.
 *
 * Found the hard way, and the finding is worth recording because it is not
 * what it looks like. `getParsedTransactions` — the batched form — is refused
 * outright by the public devnet endpoint: a batch of 12 comes back `failed to
 * get transactions: Too many requests for a specific RPC call`. Dropping to
 * batches of 6 with backoff did not help, because the limit is on the batched
 * method itself.
 *
 * Sequential single calls do get through, but spacing them out makes it
 * *worse*, not better. Measured over the same 12 signatures, back to back:
 *
 *   gap=200ms  ok=10 fail=2
 *   gap=400ms  ok=0  fail=12
 *   gap=700ms  ok=0  fail=12
 *
 * That is not a rate window, it is a **quota**. The first pass spent it, and
 * once spent every later call fails however politely it is spaced. So there is
 * no gap that makes this reliable on the public endpoint, and waiting longer
 * only wastes wall clock. Hence a short gap, few retries, and — most
 * importantly — surfaces that degrade honestly when the quota is gone.
 *
 * The real fix is `NEXT_PUBLIC_SOLANA_RPC` pointing at a dedicated endpoint.
 * That is PLAN.md task 8.3, and it is why this module refuses to invent
 * numbers rather than trying harder.
 */
const REQUEST_GAP_MS = 150;

/**
 * Attempts per transaction.
 *
 * Deliberately few. Against a spent quota a retry cannot succeed, so a long
 * backoff buys nothing but a slower page.
 */
const MAX_ATTEMPTS = 3;

/** Cache TTL. Long enough to survive a page's worth of parallel reads. */
const CACHE_MS = 60_000;

const DAY_MS = 86_400_000;

/**
 * A pool's swap history, plus whether we actually reached the beginning of it.
 *
 * `truncated` is the difference between "this pool has traded 0.51 SOL" and
 * "this pool has traded at least 0.51 SOL", and the aggregates below refuse to
 * answer questions the window cannot support.
 */
export type SwapHistory = {
  swaps: Swap[];
  /** True when the signature limit was hit, so older trades exist unread. */
  truncated: boolean;
  /**
   * How many transactions the RPC refused to return.
   *
   * Non-zero means the trades below are real but the set is not all of them —
   * so individual rows and chart points are still true, and **aggregates are
   * not** and come back null. That is the honesty boundary of this module: a
   * trade that parsed happened exactly as described; a sum over a set with
   * holes in it is simply a wrong number.
   */
  missed: number;
  /** Block time of the oldest transaction examined. Unix seconds. */
  oldestBlockTime: number | null;
};

type CacheEntry = { at: number; history: SwapHistory };
const cache = new Map<string, CacheEntry>();

/**
 * Per-pool in-flight promise.
 *
 * A coin page renders the chart, the activity tab and the volume figure from
 * the same history. Without this they would each miss the cache on a cold
 * render and fire three identical bursts at an endpoint that is already the
 * bottleneck.
 */
const inFlight = new Map<string, Promise<SwapHistory | null>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry with exponential backoff.
 *
 * Only worth doing because the failure this exists for — the per-method rate
 * limit — is transient by definition. `disableRetryOnRateLimit` is set on the
 * shared connection precisely so that retrying is a decision each caller makes
 * rather than eight seconds web3.js spends on your behalf.
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Reconstruct one swap from a parsed transaction.
 *
 * Returns null for anything that is not a swap against `baseMint` — including
 * the pool's own creation, fee claims, and the migration.
 */
export function parseSwap(
  tx: ParsedTransactionWithMeta | null,
  baseMint: string,
): Swap | null {
  const meta = tx?.meta;
  if (!tx || !meta || meta.err) return null;

  // Index → delta, in UI units. An account absent from `pre` was created by
  // this transaction, so its prior balance was zero.
  const pre = new Map<number, { mint: string; owner: string; amount: number }>();
  const post = new Map<number, { mint: string; owner: string; amount: number }>();

  for (const balance of meta.preTokenBalances ?? []) {
    pre.set(balance.accountIndex, {
      mint: balance.mint,
      owner: balance.owner ?? "",
      amount: balance.uiTokenAmount.uiAmount ?? 0,
    });
  }
  for (const balance of meta.postTokenBalances ?? []) {
    post.set(balance.accountIndex, {
      mint: balance.mint,
      owner: balance.owner ?? "",
      amount: balance.uiTokenAmount.uiAmount ?? 0,
    });
  }

  // Owner → mint → net change.
  const byOwner = new Map<string, Map<string, number>>();
  for (const index of new Set([...pre.keys(), ...post.keys()])) {
    const entry = post.get(index) ?? pre.get(index);
    if (!entry || !entry.owner) continue;
    const delta = (post.get(index)?.amount ?? 0) - (pre.get(index)?.amount ?? 0);
    const mints = byOwner.get(entry.owner) ?? new Map<string, number>();
    mints.set(entry.mint, (mints.get(entry.mint) ?? 0) + delta);
    byOwner.set(entry.owner, mints);
  }

  // The vault authority is the one owner holding both legs, with both moving.
  for (const [, mints] of byOwner) {
    const baseDelta = mints.get(baseMint);
    if (baseDelta === undefined || baseDelta === 0) continue;

    let quoteDelta: number | undefined;
    for (const [mint, delta] of mints) {
      if (mint !== baseMint && delta !== 0) {
        // More than two moving mints is not a shape this program produces;
        // bail rather than guess which leg is the quote.
        if (quoteDelta !== undefined) return null;
        quoteDelta = delta;
      }
    }
    if (quoteDelta === undefined || quoteDelta === 0) continue;

    // Both legs must move in opposite directions — that is what a swap is.
    if (Math.sign(baseDelta) === Math.sign(quoteDelta)) continue;

    const baseAmount = Math.abs(baseDelta);
    const quoteAmount = Math.abs(quoteDelta);
    if (baseAmount === 0 || quoteAmount === 0) continue;

    return {
      signature: tx.transaction.signatures[0],
      side: quoteDelta > 0 ? "buy" : "sell",
      baseAmount,
      quoteAmount,
      price: quoteAmount / baseAmount,
      trader: tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? "",
      blockTime: tx.blockTime ?? null,
    };
  }

  return null;
}

/**
 * Every swap this RPC can still see for a pool, newest first.
 *
 * Null means the read failed — callers must not render that as "no trades".
 * A history with an empty `swaps` array means the pool genuinely has none.
 */
export async function listSwaps(
  poolAddress: string,
  baseMint: string,
): Promise<SwapHistory | null> {
  const key = `${poolAddress}:${baseMint}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.history;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<SwapHistory | null> => {
    try {
      const connection = getConnection();
      const signatures = await withRetry(() =>
        connection.getSignaturesForAddress(
          new PublicKey(poolAddress),
          { limit: SIGNATURE_LIMIT },
          "confirmed",
        ),
      );

      const truncated = signatures.length >= SIGNATURE_LIMIT;
      const oldestBlockTime = signatures[signatures.length - 1]?.blockTime ?? null;
      const landed = signatures.filter((entry) => !entry.err);

      if (landed.length === 0) {
        const history: SwapHistory = {
          swaps: [],
          truncated,
          missed: 0,
          oldestBlockTime,
        };
        cache.set(key, { at: Date.now(), history });
        return history;
      }

      // One at a time, spaced. See REQUEST_GAP_MS — the batched form of this
      // call is refused outright by the public endpoint.
      //
      // A transaction the RPC will not return is counted, not thrown. Losing
      // the nine trades we did read because the tenth was rate-limited would
      // be throwing away truth to punish a partial failure; instead the rows
      // and the chart render what is real and the aggregates stand down.
      const swaps: Swap[] = [];
      let missed = 0;
      for (let i = 0; i < landed.length; i++) {
        if (i > 0) await sleep(REQUEST_GAP_MS);
        try {
          const tx = await withRetry(() =>
            connection.getParsedTransaction(landed[i].signature, {
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            }),
          );
          const swap = parseSwap(tx, baseMint);
          if (swap) swaps.push(swap);
        } catch {
          missed++;
        }
      }

      // Nothing readable at all is a failed read, not an empty pool.
      if (missed === landed.length) return null;

      swaps.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
      const history: SwapHistory = { swaps, truncated, missed, oldestBlockTime };
      cache.set(key, { at: Date.now(), history });
      return history;
    } catch (error) {
      // Deliberately not cached: a rate-limited read should be retried on the
      // next render, not remembered as the truth for a minute.
      //
      // Silent by default because every caller already degrades honestly, and
      // a rate-limited read is expected rather than exceptional. Set
      // JUNO_DEBUG to see why a history came back empty.
      if (process.env.JUNO_DEBUG) {
        console.error(
          `[indexer] ${poolAddress}:`,
          error instanceof Error ? error.message : error,
        );
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}

/**
 * True when the history does not reach back far enough to answer a question
 * about the trailing 24h.
 */
function covers24h(history: SwapHistory): boolean {
  if (history.missed > 0) return false;
  if (!history.truncated) return true;
  if (history.oldestBlockTime === null) return false;
  return history.oldestBlockTime * 1000 <= Date.now() - DAY_MS;
}

/**
 * Quote-token volume over the trailing 24h.
 *
 * Null when the read failed, and null when the window does not reach back a
 * full day — a partial day's volume reported as a day's volume is a wrong
 * number, not a rounded one.
 */
export function volume24h(history: SwapHistory | null): number | null {
  if (history === null || !covers24h(history)) return null;
  const cutoff = Date.now() - DAY_MS;
  return history.swaps
    .filter((swap) => swap.blockTime !== null && swap.blockTime * 1000 >= cutoff)
    .reduce((sum, swap) => sum + swap.quoteAmount, 0);
}

/**
 * Quote-token volume across all of it.
 *
 * Null when the history is truncated: what we would be summing is "the last 60
 * transactions", which is not the total and must not be labelled as one.
 */
export function totalVolume(history: SwapHistory | null): number | null {
  if (history === null || history.truncated || history.missed > 0) return null;
  return history.swaps.reduce((sum, swap) => sum + swap.quoteAmount, 0);
}

/**
 * Price series for the chart, oldest first.
 *
 * Swaps without a block time are dropped rather than pinned to the epoch,
 * which would drag the line back to 1970.
 */
export function pricePoints(history: SwapHistory | null): PricePoint[] {
  if (history === null) return [];
  return history.swaps
    .filter((swap) => swap.blockTime !== null)
    .map((swap) => ({ t: swap.blockTime! * 1000, price: swap.price }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Percentage change over the trailing 24h, oldest trade in the window to
 * newest.
 *
 * Null unless there are at least two points to compare — one trade is a price,
 * not a change.
 */
export function change24hPct(history: SwapHistory | null): number | null {
  if (history === null || !covers24h(history)) return null;
  const cutoff = Date.now() - DAY_MS;
  const window = pricePoints(history).filter((point) => point.t >= cutoff);
  if (window.length < 2) return null;
  const first = window[0].price;
  const last = window[window.length - 1].price;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}
