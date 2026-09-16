/**
 * Juno's Meteora Dynamic Bonding Curve adapter.
 *
 * Everything that touches the DBC program lives here. Components receive
 * plain numbers in UI units (see `lib/juno/types.ts`); this module owns the
 * BN arithmetic, the decimals, and the account decoding.
 *
 * Program id is the same on mainnet and devnet:
 *   dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
 */

import {
  ActivationType,
  DynamicBondingCurveClient,
  TokenDecimal,
  buildCurveWithLiquidityWeights,
  deriveDbcPoolAddress,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  getTokenDecimals,
  type PoolConfig,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Connection, PublicKey, type Commitment, type Transaction } from "@solana/web3.js";
import BN from "bn.js";

import { buildPresetParams, type BuildPresetOptions } from "./curves";
import type { CurveState, QuoteToken, TradeSide } from "./types";

const COMMITMENT: Commitment = "confirmed";

/*
 * The SDK derives `VirtualPool` and `SwapResult` from the Anchor IDL via
 * `IdlAccounts`/`IdlTypes`, and for these two the inference collapses to
 * `any` (`SwapResult`) or stops at the outer wrapper (`VirtualPool`, whose
 * real fields sit under `poolState`). These narrow shapes restore type safety
 * over exactly the fields Juno reads; they mirror the IDL, not a guess.
 */
type PoolStateFields = {
  config: PublicKey;
  creator: PublicKey;
  baseMint: PublicKey;
  baseReserve: BN;
  quoteReserve: BN;
  sqrtPrice: BN;
  /** u8 flag, non-zero once the pool has migrated to DAMM v2. */
  isMigrated: number;
};

type SwapResultFields = {
  actualInputAmount: BN;
  outputAmount: BN;
  nextSqrtPrice: BN;
  tradingFee: BN;
  protocolFee: BN;
  referralFee: BN;
};

/** Reach into the pool account's inner state with the fields typed. */
function poolState(pool: VirtualPool): PoolStateFields {
  return (pool as unknown as { poolState: PoolStateFields }).poolState;
}

/** USDC on Solana mainnet — Juno's default quote token. */
export const USDC: QuoteToken = {
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  symbol: "USDC",
  decimals: 6,
};

/** Wrapped SOL, for creators who would rather quote in SOL. */
export const WSOL: QuoteToken = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
};

export const QUOTE_TOKENS: QuoteToken[] = [USDC, WSOL];

export function rpcEndpoint(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC ??
    process.env.SOLANA_RPC ??
    "https://api.mainnet-beta.solana.com"
  );
}

let cachedConnection: Connection | null = null;

export function getConnection(): Connection {
  cachedConnection ??= new Connection(rpcEndpoint(), COMMITMENT);
  return cachedConnection;
}

let cachedClient: DynamicBondingCurveClient | null = null;

export function getDbcClient(): DynamicBondingCurveClient {
  cachedClient ??= DynamicBondingCurveClient.create(getConnection(), COMMITMENT);
  return cachedClient;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export type PoolSnapshot = {
  pool: VirtualPool;
  config: PoolConfig;
  poolAddress: PublicKey;
  /** Price of one base token in quote-token units. */
  price: number;
  curve: CurveState;
  baseDecimals: number;
  quoteDecimals: number;
};

/**
 * One round trip for everything the coin page needs.
 *
 * Curve progress comes from the program's own quote-side ratio rather than a
 * price comparison, because that ratio is what actually gates migration.
 */
export async function fetchPoolSnapshot(
  poolAddress: string | PublicKey,
  quoteUsdPrice = 1,
): Promise<PoolSnapshot | null> {
  const client = getDbcClient();
  const address = new PublicKey(poolAddress);

  const pool = await client.state.getPool(address);
  if (!pool) return null;

  const state = poolState(pool);
  const config = await client.state.getPoolConfig(state.config);
  if (!config) return null;

  // The config only carries the *base* decimal; the quote side has to come
  // from the quote mint itself.
  const baseDecimals = config.tokenDecimal as number;
  const quoteDecimals = await getTokenDecimals(getConnection(), config.quoteMint);

  const [progress, threshold] = await Promise.all([
    client.state.getPoolQuoteTokenCurveProgress(address),
    client.state.getPoolMigrationQuoteThreshold(address),
  ]);

  const price = getPriceFromSqrtPrice(
    state.sqrtPrice,
    baseDecimals as TokenDecimal,
    quoteDecimals as TokenDecimal,
  ).toNumber();

  const thresholdUi = bnToUi(threshold, quoteDecimals);

  return {
    pool,
    config,
    poolAddress: address,
    price,
    baseDecimals,
    quoteDecimals,
    curve: {
      progress,
      raisedUsd: thresholdUi * progress * quoteUsdPrice,
      thresholdUsd: thresholdUi * quoteUsdPrice,
      graduated: state.isMigrated !== 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

export type TradeQuote = {
  /** What the trader receives, in UI units of the output token. */
  amountOut: number;
  /** Worst case after slippage. */
  minimumAmountOut: number;
  /** Trading fee paid, in UI units of the fee token. */
  fee: number;
  /** Price impact as a ratio, e.g. 0.012 for 1.2%. */
  priceImpact: number;
};

/**
 * Quote a trade against the live curve.
 *
 * `swapBaseForQuote` is DBC's direction flag: true is a sell (base in, quote
 * out), false is a buy.
 */
export async function quoteTrade(params: {
  snapshot: PoolSnapshot;
  side: TradeSide;
  /** Input amount in UI units — quote units for a buy, base units for a sell. */
  amountIn: number;
  slippageBps?: number;
}): Promise<TradeQuote> {
  const { snapshot, side, amountIn, slippageBps = 100 } = params;
  const client = getDbcClient();
  const swapBaseForQuote = side === "sell";

  const { baseDecimals, quoteDecimals } = snapshot;
  const inDecimals = swapBaseForQuote ? baseDecimals : quoteDecimals;
  const outDecimals = swapBaseForQuote ? quoteDecimals : baseDecimals;

  const currentPoint = await getCurrentPoint(getConnection(), ActivationType.Timestamp);

  const result = client.pool.swapQuote({
    virtualPool: snapshot.pool,
    config: snapshot.config,
    swapBaseForQuote,
    amountIn: uiToBn(amountIn, inDecimals),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  }) as unknown as SwapResultFields & { minimumAmountOut: BN };

  const amountOut = bnToUi(result.outputAmount, outDecimals);
  const spotOut = swapBaseForQuote ? amountIn * snapshot.price : amountIn / snapshot.price;

  return {
    amountOut,
    minimumAmountOut: bnToUi(result.minimumAmountOut, outDecimals),
    // `collectFeeMode` is QuoteToken for every Juno preset, so the fee is
    // always denominated in the quote token regardless of direction.
    fee: bnToUi(result.tradingFee, quoteDecimals),
    priceImpact: spotOut > 0 ? Math.max(0, (spotOut - amountOut) / spotOut) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Build the unsigned transaction that launches a coin: one config key built
 * from a Juno curve preset, plus the virtual pool, in a single transaction.
 *
 * The caller signs with both the payer wallet and a fresh `configKeypair` /
 * `baseMintKeypair`.
 */
export async function buildLaunchTransaction(params: {
  payer: PublicKey;
  creator: PublicKey;
  config: PublicKey;
  baseMint: PublicKey;
  quote: QuoteToken;
  /** Token metadata. */
  name: string;
  symbol: string;
  uri: string;
  preset: BuildPresetOptions["preset"];
  initialMarketCap: number;
  migrationMarketCap: number;
  /** Who collects the partner share of trading fees — Juno's treasury. */
  feeClaimer: PublicKey;
  leftoverReceiver?: PublicKey;
}): Promise<Transaction> {
  const client = getDbcClient();

  const curve = buildCurveWithLiquidityWeights(
    buildPresetParams({
      preset: params.preset,
      initialMarketCap: params.initialMarketCap,
      migrationMarketCap: params.migrationMarketCap,
      quoteDecimals: params.quote.decimals as TokenDecimal,
    }),
  );

  return client.partner.createConfigAndPool({
    ...curve,
    config: params.config,
    feeClaimer: params.feeClaimer,
    leftoverReceiver: params.leftoverReceiver ?? params.creator,
    payer: params.payer,
    quoteMint: new PublicKey(params.quote.mint),
    preCreatePoolParam: {
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      poolCreator: params.creator,
      baseMint: params.baseMint,
    },
  });
}

/** Build the unsigned buy/sell transaction for an existing pool. */
export async function buildSwapTransaction(params: {
  snapshot: PoolSnapshot;
  owner: PublicKey;
  side: TradeSide;
  amountIn: number;
  minimumAmountOut: number;
}): Promise<Transaction> {
  const client = getDbcClient();
  const swapBaseForQuote = params.side === "sell";
  const { baseDecimals, quoteDecimals } = params.snapshot;
  const inDecimals = swapBaseForQuote ? baseDecimals : quoteDecimals;
  const outDecimals = swapBaseForQuote ? quoteDecimals : baseDecimals;

  return client.pool.swap({
    owner: params.owner,
    pool: params.snapshot.poolAddress,
    amountIn: uiToBn(params.amountIn, inDecimals),
    minimumAmountOut: uiToBn(params.minimumAmountOut, outDecimals),
    swapBaseForQuote,
    referralTokenAccount: null,
  });
}

/**
 * Where a coin's pool lives, derived rather than stored — the DBC pool address
 * is a PDA of (quote mint, base mint, config).
 */
export function poolAddressFor(
  quoteMint: string,
  baseMint: string,
  config: string,
): string {
  return deriveDbcPoolAddress(
    new PublicKey(quoteMint),
    new PublicKey(baseMint),
    new PublicKey(config),
  ).toBase58();
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export function uiToBn(amount: number, decimals: number): BN {
  // Via string to avoid float error on large amounts.
  const [whole, frac = ""] = amount.toFixed(decimals).split(".");
  return new BN(`${whole}${frac.padEnd(decimals, "0")}`);
}

export function bnToUi(amount: BN, decimals: number): number {
  return Number(amount.toString()) / 10 ** decimals;
}
