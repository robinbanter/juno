import "server-only";

import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";

import { getConnection, getDbcClient, bnToUi, fetchPoolSnapshot } from "./dbc";
import { quoteTokenUsdPrice } from "./pyth";
import { curveShape } from "./curve-shape";
import { feeSchedule, tokenomics } from "./economics";
import { dammTarget } from "./issuer";
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

  // Holders and creator fees are both real reads. `getTokenLargestAccounts`
  // returns the top 20, which is a floor on the holder count rather than an
  // exact figure — enough to render, and honest about small markets.
  const [largest, fees] = options.detailed
    ? await Promise.all([
        getConnection()
          .getTokenLargestAccounts(new PublicKey(row.baseMint))
          .catch(() => null),
        client.state.getPoolFeeMetrics(row.poolAddress).catch(() => null),
      ])
    : [null, null];

  // null, not 0: `largest` is null when the RPC refused, and "0 holders" is
  // a claim we would not have earned.
  const holders =
    largest === null
      ? null
      : largest.value.filter((account) => (account.uiAmount ?? 0) > 0).length;

  const creatorRewards = fees
    ? bnToUi(fees.current.creatorQuoteFee, snapshot.quoteDecimals) * rate
    : 0;

  const media = {
    kind: (row.mediaUrl?.match(/\.(mp4|webm|mov)$/i) ? "video" : "image") as
      | "image"
      | "video",
    url: row.mediaUrl ?? identicon(row.baseMint),
    posterUrl: row.posterUrl ?? row.mediaUrl ?? identicon(row.baseMint),
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
    // Derived from the config's own migration fee tier — the DAMM v2 pool is
    // a PDA of that tier's config and the two mints.
    graduatedPool: snapshot.curve.graduated
      ? dammTarget({
          migrationFeeOption: Number(snapshot.config.migrationFeeOption),
          baseMint: row.baseMint,
          quoteMint: row.quoteMint,
        })?.pool.toBase58()
      : undefined,
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
 * Hydrate many for a list view, dropping any whose pool is missing here.
 *
 * Bounded concurrency rather than `Promise.all`: firing every pool read
 * simultaneously is the burst the public devnet RPC answers with 429s, and a
 * grid of four pools does not need to be four times as rude as one.
 */
export async function hydratePools(rows: JunoPoolRow[], width = 2): Promise<Coin[]> {
  const out: Array<Coin | null> = new Array(rows.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      out[index] = await hydratePool(rows[index]).catch(() => null);
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, rows.length) }, worker));
  return out.filter((coin): coin is Coin => coin !== null);
}
