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
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  SwapMode,
  U64_MAX,
  TokenDecimal,
  buildCurveWithLiquidityWeights,
  deriveDbcPoolAddress,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  getTokenDecimals,
  type PoolConfig,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import BN from "bn.js";

import { isMainnet, rpcEndpoint } from "./cluster";
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

/**
 * Wrapped SOL. The one mint with the same address on every cluster, which
 * makes it the only quote token a devnet rehearsal can rely on.
 */
export const WSOL: QuoteToken = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
};

/** Circle USDC. Different mint per cluster — quoting the wrong one fails. */
export const USDC: QuoteToken = {
  mint: isMainnet()
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  symbol: "USDC",
  decimals: 6,
};

/**
 * Equity-shaped launches quote in USDC so the curve is denominated in the
 * same unit as the underlying. SOL is offered for content coins, where a
 * SOL-denominated market is the convention.
 */
export const QUOTE_TOKENS: QuoteToken[] = [USDC, WSOL];

let cachedConnection: Connection | null = null;

export function getConnection(): Connection {
  cachedConnection ??= new Connection(rpcEndpoint(), {
    commitment: COMMITMENT,
    // The public devnet endpoint refuses some calls outright —
    // `getTokenLargestAccounts` among them. web3.js answers a 429 by retrying
    // four times with backoff and logging each attempt, which turns one
    // already-handled failure into a wall of console noise and eight seconds
    // of latency. Every caller that can 429 already degrades honestly, so fail
    // fast and let them.
    disableRetryOnRateLimit: true,
  });
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
/**
 * Pool configs and mint decimals never change after creation, so re-reading
 * them on every render is pure load on the RPC — and the public devnet
 * endpoint answers that load with 429s. Cached for the process lifetime.
 */
const configCache = new Map<string, PoolConfig>();
const decimalsCache = new Map<string, number>();

async function cachedConfig(configAddress: PublicKey): Promise<PoolConfig | null> {
  const key = configAddress.toBase58();
  const hit = configCache.get(key);
  if (hit) return hit;
  const config = await getDbcClient().state.getPoolConfig(configAddress);
  if (config) configCache.set(key, config);
  return config;
}

async function cachedDecimals(mint: PublicKey): Promise<number> {
  const key = mint.toBase58();
  const hit = decimalsCache.get(key);
  if (hit !== undefined) return hit;
  const decimals = await getTokenDecimals(getConnection(), mint);
  decimalsCache.set(key, decimals);
  return decimals;
}

/**
 * Snapshots are cached for a few seconds.
 *
 * A curve does not move between the moment a grid renders and the moment the
 * page beneath it does, and the public devnet RPC rate-limits bursts hard
 * enough to surface 429s in the console. Short enough that a trade's effect is
 * visible on the next interaction, long enough that one navigation is one read.
 */
const SNAPSHOT_TTL_MS = 5_000;
const snapshotCache = new Map<string, { at: number; value: PoolSnapshot | null }>();

export async function fetchPoolSnapshot(
  poolAddress: string | PublicKey,
  quoteUsdPrice = 1,
): Promise<PoolSnapshot | null> {
  const cacheKey = `${poolAddress.toString()}:${quoteUsdPrice}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.value;

  const value = await readPoolSnapshot(poolAddress, quoteUsdPrice);
  snapshotCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** Drop a pool's cached snapshot — call after a trade so the next read is live. */
export function invalidatePoolSnapshot(poolAddress: string | PublicKey): void {
  const prefix = `${poolAddress.toString()}:`;
  for (const key of snapshotCache.keys()) {
    if (key.startsWith(prefix)) snapshotCache.delete(key);
  }
}

async function readPoolSnapshot(
  poolAddress: string | PublicKey,
  quoteUsdPrice: number,
): Promise<PoolSnapshot | null> {
  const client = getDbcClient();
  const address = new PublicKey(poolAddress);

  const pool = await client.state.getPool(address);
  if (!pool) return null;

  const state = poolState(pool);
  const config = await cachedConfig(state.config);
  if (!config) return null;

  // The config only carries the *base* decimal; the quote side has to come
  // from the quote mint itself.
  const baseDecimals = config.tokenDecimal as number;
  const quoteDecimals = await cachedDecimals(config.quoteMint);

  // `getPoolQuoteTokenCurveProgress` and `getPoolMigrationQuoteThreshold` each
  // re-fetch the pool and config we already hold. The ratio is quote reserve
  // over the config's threshold, so compute it from what is in hand.
  const thresholdBn = config.migrationQuoteThreshold as BN;
  const reserveBn = state.quoteReserve;
  const threshold = thresholdBn;
  const progress =
    thresholdBn.isZero() === false
      ? Math.min(1, Number(reserveBn.toString()) / Number(thresholdBn.toString()))
      : 0;

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

export type LaunchRequest = {
  payer: PublicKey;
  creator: PublicKey;
  quote: QuoteToken;
  name: string;
  symbol: string;
  /** Token metadata URI. Empty string is accepted by the program. */
  uri: string;
  preset: BuildPresetOptions["preset"];
  initialMarketCap: number;
  migrationMarketCap: number;
  /** Who collects the partner share of trading fees. Defaults to the creator. */
  feeClaimer?: PublicKey;
  leftoverReceiver?: PublicKey;
};

export type LaunchStep = {
  /** Shown while this step is in flight. */
  label: string;
  transaction: Transaction;
  /** Freshly generated accounts that must co-sign this step. */
  signers: Keypair[];
};

export type LaunchPlan = {
  /** Sent in order. Each must confirm before the next is valid. */
  steps: LaunchStep[];
  config: PublicKey;
  baseMint: PublicKey;
  pool: PublicKey;
};

/**
 * Plan a launch: create a config key from a Juno curve preset, then initialise
 * its virtual pool.
 *
 * This is deliberately two transactions rather than the SDK's
 * `createConfigAndPool` convenience. A sixteen-segment curve serialises to
 * ~739 bytes of instruction data on its own; bundled with the pool init and
 * three signatures the message reaches ~1488 bytes, well past Solana's 1232
 * byte packet limit, and the send fails outright. Splitting keeps both steps
 * comfortably inside one packet without giving up curve resolution — and
 * sixteen segments is the whole point of Juno's presets.
 *
 * The config account and the base mint are new accounts, so both are generated
 * here and returned as co-signers; the SDK builds instructions but does not
 * create or sign for them.
 */
export async function planLaunch(params: LaunchRequest): Promise<LaunchPlan> {
  const client = getDbcClient();

  const configKeypair = Keypair.generate();
  const baseMintKeypair = Keypair.generate();
  const quoteMint = new PublicKey(params.quote.mint);

  const curve = buildCurveWithLiquidityWeights(
    buildPresetParams({
      preset: params.preset,
      initialMarketCap: params.initialMarketCap,
      migrationMarketCap: params.migrationMarketCap,
      quoteDecimals: params.quote.decimals as TokenDecimal,
    }),
  );

  // `createConfigAndPoolWithFirstBuy` with no first buy is the only builder
  // that returns the two transactions *separately*. `createConfigAndPool`
  // bundles them past the packet limit, and `creator.createPool` on its own
  // reads the config account from chain — which does not exist yet.
  const { createConfigTx, createPoolWithFirstBuyTx } =
    await client.partner.createConfigAndPoolWithFirstBuy({
      ...curve,
      config: configKeypair.publicKey,
      feeClaimer: params.feeClaimer ?? params.creator,
      // Must not be the default key: the program rejects an all-zeroes
      // receiver, which would burn the leftover supply at migration.
      leftoverReceiver: params.leftoverReceiver ?? params.creator,
      payer: params.payer,
      quoteMint,
      preCreatePoolParam: {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        poolCreator: params.creator,
        baseMint: baseMintKeypair.publicKey,
      },
    });

  return {
    steps: [
      { label: "Creating the curve config", transaction: createConfigTx, signers: [configKeypair] },
      { label: "Opening the pool", transaction: createPoolWithFirstBuyTx, signers: [baseMintKeypair] },
    ],
    config: configKeypair.publicKey,
    baseMint: baseMintKeypair.publicKey,
    pool: deriveDbcPoolAddress(quoteMint, baseMintKeypair.publicKey, configKeypair.publicKey),
  };
}

/** A `signTransaction` for a local keypair — how the CLI scripts sign. */
export function keypairSigner(keypair: Keypair) {
  return async (tx: Transaction) => {
    tx.partialSign(keypair);
    return tx;
  };
}

export type SimulationResult = {
  ok: boolean;
  err: unknown;
  logs: string[];
  unitsConsumed: number | null;
};

/**
 * Dry-run a transaction the SDK built, exactly as it would be sent, without
 * the payer's signature.
 *
 * The same finishing steps `sendTransaction` applies (fee payer, blockhash,
 * co-signers) happen here, then the cluster executes it with signature
 * verification off. That proves a builder produces a transaction the program
 * accepts, for a wallet whose key is not available — a browser wallet, say.
 */
export async function simulateTransaction(params: {
  transaction: Transaction;
  payer: PublicKey;
  signers?: Keypair[];
}): Promise<SimulationResult> {
  const connection = getConnection();
  const { transaction, payer, signers = [] } = params;

  const { blockhash } = await connection.getLatestBlockhash(COMMITMENT);
  transaction.feePayer = payer;
  transaction.recentBlockhash = blockhash;
  if (signers.length > 0) transaction.partialSign(...signers);

  const message = transaction.compileMessage();
  const versioned = new VersionedTransaction(message);
  for (const { publicKey, signature } of transaction.signatures) {
    if (signature) versioned.addSignature(publicKey, signature);
  }

  const { value } = await connection.simulateTransaction(versioned, {
    sigVerify: false,
    commitment: COMMITMENT,
  });
  return {
    ok: value.err === null,
    err: value.err,
    logs: value.logs ?? [],
    unitsConsumed: value.unitsConsumed ?? null,
  };
}

/**
 * Finish and send a transaction the SDK built.
 *
 * The SDK returns bare instructions — no fee payer, no blockhash, nothing
 * signed. All three are this function's job, in that order, because a
 * transaction cannot be signed before it knows what it is paying for.
 */
export async function sendTransaction(params: {
  transaction: Transaction;
  payer: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  /** Newly created accounts that must co-sign, e.g. a config or mint. */
  signers?: Keypair[];
  /** Fired once the cluster has accepted the transaction, before confirmation. */
  onSent?: (signature: string) => void;
}): Promise<string> {
  const connection = getConnection();
  const { transaction, payer, signers = [] } = params;

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  transaction.feePayer = payer;
  transaction.recentBlockhash = blockhash;

  // Co-signers first: the wallet's signature must cover the final message, so
  // nothing may be added to the transaction after it signs.
  if (signers.length > 0) transaction.partialSign(...signers);

  const signed = await params.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  params.onSent?.(signature);

  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    COMMITMENT,
  );
  if (result.value.err) {
    throw new Error(
      `Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`,
    );
  }

  return signature;
}

/**
 * Send a plan's steps in order, confirming each before starting the next.
 *
 * Sequential rather than batched because the pool init references the config
 * account by address — it is only a valid instruction once the config exists
 * on-chain. Each step gets a fresh blockhash for the same reason: signing
 * both up front risks the second expiring while the first confirms.
 */
export async function sendLaunch(params: {
  plan: LaunchPlan;
  payer: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  onStep?: (step: { index: number; total: number; label: string }) => void;
}): Promise<string[]> {
  const signatures: string[] = [];

  for (const [index, step] of params.plan.steps.entries()) {
    params.onStep?.({ index, total: params.plan.steps.length, label: step.label });
    signatures.push(
      await sendTransaction({
        transaction: step.transaction,
        payer: params.payer,
        signTransaction: params.signTransaction,
        signers: step.signers,
      }),
    );
  }

  return signatures;
}

/**
 * Buy whatever is left of a curve without knowing exactly how much that is.
 *
 * An exact-in swap reverts with `Insufficient Liquidity` the moment the input
 * exceeds the curve's remaining capacity, which makes finishing a nearly
 * complete curve a guessing game measured in lamports. `SwapMode.PartialFill`
 * fills what the pool can absorb and returns the rest, so "complete this
 * curve" becomes one call instead of a binary search.
 */
export async function buildPartialFillSwapTransaction(params: {
  snapshot: PoolSnapshot;
  owner: PublicKey;
  side: TradeSide;
  /** Upper bound. The program fills up to the curve's capacity. */
  amountIn: number;
  minimumAmountOut?: number;
}): Promise<Transaction> {
  const swapBaseForQuote = params.side === "sell";
  const { baseDecimals, quoteDecimals } = params.snapshot;
  const inDecimals = swapBaseForQuote ? baseDecimals : quoteDecimals;
  const outDecimals = swapBaseForQuote ? quoteDecimals : baseDecimals;

  return getDbcClient().pool.swap2({
    owner: params.owner,
    pool: params.snapshot.poolAddress,
    swapMode: SwapMode.PartialFill,
    amountIn: uiToBn(params.amountIn, inDecimals),
    minimumAmountOut: uiToBn(params.minimumAmountOut ?? 0, outDecimals),
    swapBaseForQuote,
    referralTokenAccount: null,
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

/* ------------------------------------------------------------------ */
/* Creator economics                                                   */
/* ------------------------------------------------------------------ */

export type FeeBalance = {
  /** Claimable now, in UI units. */
  baseAmount: number;
  quoteAmount: number;
  /** Quote-side fees already taken, for a lifetime figure. */
  claimedQuote: number;
};

/**
 * What a creator can actually withdraw right now.
 *
 * `getPoolFeeMetrics` reports the *current* unclaimed split, which is the only
 * figure worth putting next to a claim button — a lifetime total would invite
 * someone to click expecting money that is already in their wallet.
 */
export async function fetchCreatorFees(
  poolAddress: string | PublicKey,
): Promise<FeeBalance | null> {
  const snapshot = await fetchPoolSnapshot(poolAddress);
  if (!snapshot) return null;

  const metrics = await getDbcClient()
    .state.getPoolFeeMetrics(poolAddress)
    .catch(() => null);
  if (!metrics) return null;

  return {
    baseAmount: bnToUi(metrics.current.creatorBaseFee, snapshot.baseDecimals),
    quoteAmount: bnToUi(metrics.current.creatorQuoteFee, snapshot.quoteDecimals),
    claimedQuote: bnToUi(metrics.total.totalTradingQuoteFee, snapshot.quoteDecimals),
  };
}

/**
 * Build the transaction that pays a creator their accrued trading fees.
 *
 * `maxBaseAmount` / `maxQuoteAmount` are ceilings, not amounts — the program
 * transfers whatever has accrued up to them. Passing the full u64 means "all
 * of it", which is what a claim button should mean.
 */
export async function buildClaimCreatorFeesTransaction(params: {
  creator: PublicKey;
  pool: string | PublicKey;
  receiver?: PublicKey;
}): Promise<Transaction> {
  return getDbcClient().creator.claimCreatorTradingFee({
    creator: params.creator,
    payer: params.creator,
    pool: new PublicKey(params.pool),
    maxBaseAmount: U64_MAX,
    maxQuoteAmount: U64_MAX,
    receiver: params.receiver ?? params.creator,
  });
}

/* ------------------------------------------------------------------ */
/* Graduation                                                          */
/* ------------------------------------------------------------------ */

export type MigrationPlan = {
  transaction: Transaction;
  /** Position NFTs minted for the migrated liquidity; both must co-sign. */
  signers: Keypair[];
};

/**
 * Build the transaction that migrates a completed curve into a DAMM v2 pool.
 *
 * Only valid once the curve has actually finished — the program rejects an
 * early migration, which is the correct behaviour and why the UI gates the
 * button on `curve.progress` rather than letting someone burn a fee finding
 * out.
 *
 * Meteora runs keepers that migrate eligible pools on mainnet, so this is a
 * manual path for devnet and for anyone who would rather not wait.
 */
export async function planMigration(params: {
  payer: PublicKey;
  pool: string | PublicKey;
  /** DAMM v2 config for the fee tier the pool was configured to graduate into. */
  dammConfig: PublicKey;
}): Promise<MigrationPlan> {
  const response = await getDbcClient().migration.migrateToDammV2({
    payer: params.payer,
    pool: new PublicKey(params.pool),
    dammConfig: params.dammConfig,
  });

  return {
    transaction: response.transaction,
    signers: [response.firstPositionNftKeypair, response.secondPositionNftKeypair],
  };
}

/**
 * The DAMM v2 config address for a pool's configured migration fee tier.
 *
 * `DAMM_V2_MIGRATION_FEE_ADDRESS` is indexed by `MigrationFeeOption`, so the
 * tier chosen at launch determines which config the pool graduates into.
 */
export function dammV2ConfigFor(migrationFeeOption: number): PublicKey {
  const address = DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption];
  if (!address) {
    throw new Error(`No DAMM v2 config for migration fee option ${migrationFeeOption}`);
  }
  return address;
}
