import "server-only";

import type BN from "bn.js";

import {
  bnToUi,
  fetchHolderAccounts,
  fetchPoolSnapshot,
  getDbcClient,
  prefetchPools,
} from "./dbc";
import { quoteTokenUsdPrice } from "./pyth";
import { curveShape } from "./curve-shape";
import { feeSchedule, tokenomics } from "./economics";
import { identicon } from "./identicon";
import type { JunoPoolRow } from "./registry";
import type { Coin, CoinFormat, CurvePresetId, Creator, QuoteToken } from "./types";
import { shortAddress } from "./format";

/**
 * Turns a registry row plus live chain state into the `Coin` the UI renders.
 *
 * Split of responsibility: the row supplies identity (who launched it, what
 * they called it, which preset), the chain supplies every number. Nothing
 * numeric is stored or cached.
 */

/** The live sqrt price, reached through the pool account's inner state. */
function poolSqrtPrice(snapshot: { pool: unknown }): BN {
  return (snapshot.pool as { poolState: { sqrtPrice: BN } }).poolState.sqrtPrice;
}

/** Total supply every Juno preset mints. Mirrors `DEFAULT_TOTAL_SUPPLY`. */
const TOTAL_SUPPLY = 1_000_000_000;

function creatorFromWallet(wallet: string): Creator {
  return {
    handle: shortAddress(wallet, 4, 4),
    displayName: shortAddress(wallet, 4, 4),
    avatarUrl: identicon(wallet),
    ticker: shortAddress(wallet, 4, 4),
    wallet,
    followers: 0,
    following: 0,
    posts: 0,
    marketCap: 0,
    marketCapCurrency: "USD",
    marketCapChangePct: 0,
  };
}

function quoteFromRow(row: JunoPoolRow, decimals: number): QuoteToken {
  const symbol =
    row.quoteMint === "So11111111111111111111111111111111111111112" ? "SOL" : "USDC";
  return { mint: row.quoteMint, symbol, decimals };
}

/**
 * Hydrate one pool. Returns null when the pool is not on-chain — which happens
 * if a row was recorded against a different cluster.
 */
export async function hydratePool(
  row: JunoPoolRow,
  /**
   * Holder count and fee metrics cost two extra RPC calls per pool. A grid of
   * tiles shows neither, so list views skip them rather than burning the rate
   * limit on numbers nobody sees.
   */
  options: { detailed?: boolean } = {},
): Promise<Coin | null> {
  // Null means no USD feed. The pool is then reported in its own quote token
  // rather than converted at a rate nobody published.
  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);
  const rate = quoteUsd ?? 1;

  const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
  if (!snapshot) return null;

  const priceUsd = snapshot.price * rate;
  const client = getDbcClient();

  // Holders and creator fees are both real reads. `fetchHolderAccounts`
  // returns every account with a non-zero balance, so the count is exact.
  const [holderAccounts, fees] = options.detailed
    ? await Promise.all([
        fetchHolderAccounts(row.baseMint).catch(() => null),
        client.state.getPoolFeeMetrics(row.poolAddress).catch(() => null),
      ])
    : [null, null];

  // null, not 0: null means the RPC refused, and "0 holders" is a claim we
  // would not have earned.
  const holders = holderAccounts === null ? null : holderAccounts.length;

  const creatorRewards = fees
    ? bnToUi(fees.current.creatorQuoteFee, snapshot.quoteDecimals) * rate
    : 0;

  // The stored MIME type decides image vs video: IPFS URLs carry no file
  // extension, so the extension test only covers media hosted elsewhere.
  const isVideo = row.mediaMime
    ? row.mediaMime.startsWith("video/")
    : /\.(mp4|webm|mov)$/i.test(row.mediaUrl ?? "");
  // A poster is rendered as an <img>. A video's own URL there is a broken
  // image, so a video without a separate still falls back to the identicon.
  const poster =
    row.posterUrl && !(isVideo && row.posterUrl === row.mediaUrl)
      ? row.posterUrl
      : isVideo
        ? identicon(row.baseMint)
        : (row.mediaUrl ?? identicon(row.baseMint));

  const media = {
    kind: (isVideo ? "video" : "image") as "image" | "video",
    url: row.mediaUrl ?? identicon(row.baseMint),
    posterUrl: poster,
    width: row.mediaWidth ?? (row.format === "reel" ? 720 : 1000),
    height: row.mediaHeight ?? (row.format === "reel" ? 1280 : 1000),
  };

  return {
    address: row.baseMint,
    format: row.format as CoinFormat,
    name: row.name,
    symbol: row.symbol,
    description: row.description ?? undefined,
    media,
    creator: creatorFromWallet(row.creatorWallet),
    createdAt: row.createdAt.toISOString(),
    pool: row.poolAddress,
    config: row.configAddress,
    quote: quoteFromRow(row, snapshot.quoteDecimals),
    marketCap: priceUsd * TOTAL_SUPPLY,
    marketCapCurrency: quoteUsd === null ? quoteFromRow(row, snapshot.quoteDecimals).symbol : "USD",
    // Needs a price history to compute. Flat until an indexer exists.
    marketCapChangePct: 0,
    volume24h: null,
    totalVolume: null,
    creatorRewards,
    holders,
    priceUsd,
    curve: snapshot.curve,
    curvePreset: row.curvePreset as CurvePresetId,
    graduatedPool: snapshot.curve.graduated ? row.poolAddress : undefined,
    fee: options.detailed
      ? feeSchedule({
          config: snapshot.config,
          activationPoint: Number(
            (snapshot.pool as { poolState: { activationPoint: BN } }).poolState.activationPoint.toString(),
          ),
        })
      : undefined,
    supply: options.detailed
      ? tokenomics(snapshot.config, snapshot.baseDecimals)
      : undefined,
    shape: options.detailed
      ? curveShape({
          config: snapshot.config,
          baseDecimals: snapshot.baseDecimals,
          quoteDecimals: snapshot.quoteDecimals,
          currentSqrtPrice: poolSqrtPrice(snapshot),
        })
      : undefined,
  };
}

/**
 * The result of hydrating a list, including the pools that could not be read.
 *
 * `unavailable` is the whole point. A pool whose chain read the RPC refused is
 * not a pool that does not exist, and a list view that silently drops it tells
 * a visitor something false: a creator with eight coins shows "2 Posts", and
 * when every read fails the grid falls through to "No coins yet — launch the
 * first one". Pages use this to say how many coins are missing and why.
 */
export type HydrationReport = {
  coins: Coin[];
  /** In the registry, but the RPC refused the live read — even after a retry. */
  unavailable: JunoPoolRow[];
};

/**
 * Hydrate many for a list view.
 *
 * Two outcomes are kept apart:
 *   - `hydratePool` returns null -> not on this cluster; genuinely dropped
 *   - `hydratePool` throws       -> the RPC refused; reported as unavailable
 *
 * Bounded concurrency rather than `Promise.all`: firing every pool read
 * simultaneously is the burst the public devnet RPC answers with 429s. Pools
 * that fail get one sequential retry after a pause, since most refusals are
 * transient and a single retry recovers the majority of them.
 */
export async function hydratePoolsReport(
  rows: JunoPoolRow[],
  width = 2,
): Promise<HydrationReport> {
  // One bulk read for every pool on the list, so the per-pool hydration below
  // is served from memory. A refusal here costs nothing: each pool then reads
  // itself, and fails or retries exactly as it did before.
  await prefetchPools(rows.map((row) => row.poolAddress)).catch(() => undefined);

  const FAILED = Symbol("failed");
  const out: Array<Coin | null | typeof FAILED> = new Array(rows.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      out[index] = await hydratePool(rows[index]).catch(() => FAILED);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, rows.length) }, worker));

  const failed = out.map((v, i) => (v === FAILED ? i : -1)).filter((i) => i >= 0);
  if (failed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    for (const index of failed) {
      out[index] = await hydratePool(rows[index]).catch(() => FAILED);
    }
  }

  return {
    coins: out.filter((v): v is Coin => v !== null && v !== FAILED),
    unavailable: rows.filter((_, i) => out[i] === FAILED),
  };
}

/**
 * Hydrate many, coins only. Kept for callers that have no way to show what is
 * missing — prefer `hydratePoolsReport` anywhere a count or empty state is
 * rendered, because this silently omits pools the RPC refused.
 */
export async function hydratePools(rows: JunoPoolRow[], width = 2): Promise<Coin[]> {
  return (await hydratePoolsReport(rows, width)).coins;
}
