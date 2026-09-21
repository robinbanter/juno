import "server-only";

import { PublicKey, Transaction, type Keypair } from "@solana/web3.js";

import {
  QUOTE_TOKENS,
  buildSwapTransaction,
  fetchPoolSnapshot,
  getConnection,
  invalidatePoolSnapshot,
  planLaunch,
  quoteTrade,
  type LaunchRequest,
  type TradeQuote,
} from "./dbc";
import { CURVE_PRESETS } from "./curves";
import { CallerError } from "./api";
import { quoteTokenUsdPrice } from "./pyth";
import { invalidateSwapHistory } from "./swaps";
import type { CurvePresetId, TradeSide } from "./types";

/**
 * Transactions built on the server, signed on the device.
 *
 * The mobile client does not carry `@solana/web3.js` or the Meteora SDK. It
 * asks for the bytes of an unsigned transaction, signs them with the user's
 * embedded wallet, and hands them back to be submitted. The private key never
 * leaves the phone and the resulting signature is verifiable on an explorer —
 * this is a thin-client split, not a custodial one.
 *
 * ## Why a launch is partially signed here
 *
 * A launch creates two brand-new accounts — the curve config and the base mint
 * — and the program requires each to sign for its own creation. Those keypairs
 * are generated per launch and are worthless afterwards: they authorise exactly
 * one account creation and hold nothing. Two options existed, and only one is
 * safe. Shipping their secret keys to the phone would put key material on the
 * wire for no benefit. Instead the server `partialSign`s with them and returns
 * a transaction that is complete except for the payer's signature, which only
 * the phone can add.
 *
 * That is why serialisation here always passes `requireAllSignatures: false`:
 * by definition these transactions are missing the one signature the client
 * exists to provide.
 *
 * ## Blockhashes expire
 *
 * Every transaction is built against a blockhash that is valid for roughly a
 * minute. The client is told which one and until what height, so a user who
 * leaves the buy sheet open and comes back gets a clear "quote expired" rather
 * than a transaction that fails at submit for reasons it cannot explain.
 */

/** Solana's transaction packet limit. A message over this cannot be sent. */
const PACKET_LIMIT = 1232;

/**
 * Where a launch starts and where it graduates, in quote-token terms.
 *
 * Market caps are a launch parameter rather than a property of the curve
 * preset — the same shape can be opened at any size. These mirror the defaults
 * the web launch form and `npm run juno:launch` already use, so a coin launched
 * from the phone is the same coin launched from anywhere else.
 */
const DEFAULT_INITIAL_MARKET_CAP = 1_000;
const DEFAULT_MIGRATION_MARKET_CAP = 25_000;

export type UnsignedTransaction = {
  /** Base64 of the serialised, not-yet-fully-signed transaction. */
  transaction: string;
  /** Shown while this step is in flight. */
  label: string;
  /** Size in bytes, so a caller can see how close to the limit it is. */
  bytes: number;
};

export type BlockhashWindow = {
  blockhash: string;
  lastValidBlockHeight: number;
};

function serialise(transaction: Transaction, label: string): UnsignedTransaction {
  const raw = transaction.serialize({
    // The payer's signature is the whole point of sending this to a device.
    requireAllSignatures: false,
    verifySignatures: false,
  });

  if (raw.length > PACKET_LIMIT) {
    throw new Error(
      `${label} serialises to ${raw.length} bytes, over Solana's ${PACKET_LIMIT} limit`,
    );
  }

  return { transaction: raw.toString("base64"), label, bytes: raw.length };
}

async function prepare(
  transaction: Transaction,
  payer: PublicKey,
  signers: Keypair[] = [],
): Promise<{ transaction: Transaction; window: BlockhashWindow }> {
  const { blockhash, lastValidBlockHeight } =
    await getConnection().getLatestBlockhash("confirmed");

  transaction.feePayer = payer;
  transaction.recentBlockhash = blockhash;

  // Co-signers must sign before the payer does: a signature covers the whole
  // message, so nothing may be added to it after the payer has signed.
  if (signers.length > 0) transaction.partialSign(...signers);

  return { transaction, window: { blockhash, lastValidBlockHeight } };
}

/* ------------------------------------------------------------------ */
/* Swap                                                                */
/* ------------------------------------------------------------------ */

export type SwapBuildRequest = {
  /** Base mint of the coin being traded. */
  mint: string;
  poolAddress: string;
  side: TradeSide;
  /** Input amount in UI units — quote units on a buy, base units on a sell. */
  amountIn: number;
  /** The wallet that will sign and pay. */
  owner: string;
  slippageBps?: number;
};

export type SwapBuildResult = {
  unsigned: UnsignedTransaction;
  window: BlockhashWindow;
  quote: TradeQuote;
  /** What the quote is denominated in, for honest labelling on the client. */
  quoteSymbol: string;
  /** Null when no USD feed is available for the quote token. */
  quoteUsdRate: number | null;
};

export async function buildSwap(request: SwapBuildRequest): Promise<SwapBuildResult> {
  if (!Number.isFinite(request.amountIn) || request.amountIn <= 0) {
    throw new CallerError("Amount must be greater than zero");
  }

  const owner = new PublicKey(request.owner);
  const snapshot = await fetchPoolSnapshot(request.poolAddress);
  if (!snapshot) throw new CallerError("Pool not found on this cluster");

  // The program rejects a swap against a migrated curve. Saying so here is a
  // far better error than the one the chain would return after signing.
  if (snapshot.curve.graduated) {
    throw new CallerError("This pool has graduated — trade it in its DAMM v2 pool");
  }

  const quote = await quoteTrade({
    snapshot,
    side: request.side,
    amountIn: request.amountIn,
    slippageBps: request.slippageBps ?? 100,
  });

  const transaction = await buildSwapTransaction({
    snapshot,
    owner,
    side: request.side,
    amountIn: request.amountIn,
    minimumAmountOut: quote.minimumAmountOut,
  });

  const prepared = await prepare(transaction, owner);
  const quoteMint = QUOTE_TOKENS.find((token) => token.mint === snapshot.config.quoteMint.toBase58());
  const quoteUsdRate = await quoteTokenUsdPrice(
    snapshot.config.quoteMint.toBase58(),
  ).catch(() => null);

  return {
    unsigned: serialise(prepared.transaction, request.side === "buy" ? "Buying" : "Selling"),
    window: prepared.window,
    quote,
    quoteSymbol: quoteMint?.symbol ?? "SOL",
    quoteUsdRate,
  };
}

/* ------------------------------------------------------------------ */
/* Launch                                                              */
/* ------------------------------------------------------------------ */

export type LaunchBuildRequest = {
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  preset: CurvePresetId;
  quoteMint: string;
  initialMarketCap?: number;
  migrationMarketCap?: number;
};

export type LaunchBuildResult = {
  /** Sent in order. Each must confirm before the next is valid. */
  steps: UnsignedTransaction[];
  window: BlockhashWindow;
  config: string;
  baseMint: string;
  pool: string;
};

export async function buildLaunch(
  request: LaunchBuildRequest,
): Promise<LaunchBuildResult> {
  const preset = CURVE_PRESETS[request.preset];
  if (!preset) {
    throw new CallerError(
      `Unknown preset "${request.preset}". One of: ${Object.keys(CURVE_PRESETS).join(", ")}`,
    );
  }

  const quote = QUOTE_TOKENS.find((token) => token.mint === request.quoteMint);
  if (!quote) throw new CallerError("Unsupported quote token");

  const creator = new PublicKey(request.creator);

  const plan = await planLaunch({
    payer: creator,
    creator,
    quote,
    name: request.name,
    symbol: request.symbol,
    uri: request.uri,
    preset: request.preset,
    initialMarketCap: request.initialMarketCap ?? DEFAULT_INITIAL_MARKET_CAP,
    migrationMarketCap: request.migrationMarketCap ?? DEFAULT_MIGRATION_MARKET_CAP,
  } satisfies LaunchRequest);

  // One blockhash for both steps. They are signed together on the device and
  // submitted back to back, so a second fetch would only widen the window in
  // which the first can expire before the second is sent.
  const { blockhash, lastValidBlockHeight } =
    await getConnection().getLatestBlockhash("confirmed");

  const steps = plan.steps.map((step) => {
    step.transaction.feePayer = creator;
    step.transaction.recentBlockhash = blockhash;
    if (step.signers.length > 0) step.transaction.partialSign(...step.signers);
    return serialise(step.transaction, step.label);
  });

  return {
    steps,
    window: { blockhash, lastValidBlockHeight },
    config: plan.config.toBase58(),
    baseMint: plan.baseMint.toBase58(),
    pool: plan.pool.toBase58(),
  };
}

/* ------------------------------------------------------------------ */
/* Submit                                                              */
/* ------------------------------------------------------------------ */

export type SubmitResult = {
  signature: string;
  /** Pool whose cached reads were dropped, when the caller named one. */
  invalidated?: string;
};

/**
 * Submit a transaction the device signed, and wait for confirmation.
 *
 * Preflight is left on. It costs one simulated run and turns most failures
 * into a readable error before the transaction is ever broadcast, which on a
 * phone is the difference between "not enough SOL" and a signature that
 * silently never lands.
 */
export async function submitSigned(params: {
  /** Base64 of the fully signed transaction. */
  transaction: string;
  window?: BlockhashWindow;
  /** Pool to drop from the read caches once this confirms. */
  poolAddress?: string;
}): Promise<SubmitResult> {
  const connection = getConnection();
  const raw = Buffer.from(params.transaction, "base64");

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch (error) {
    // A cluster refusing *this transaction* is not a fault in this server, and
    // reporting it as one ("Something went wrong on our side") is the worst
    // possible answer: it hides the one thing the person can act on. Preflight
    // is on precisely so this reason exists — throwing it as a CallerError is
    // what lets it reach the phone.
    throw new CallerError(explainSubmitFailure(error), 422);
  }

  const window = params.window ?? (await connection.getLatestBlockhash("confirmed"));
  const result = await connection.confirmTransaction(
    {
      signature,
      blockhash: window.blockhash,
      lastValidBlockHeight: window.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (result.value.err) {
    throw new CallerError(
      `${explainSubmitFailure(result.value.err)} The transaction is on-chain as ${signature}.`,
      422,
    );
  }

  // The price, curve and history all just moved. Drop them so the next read
  // is live rather than up to a minute stale.
  if (params.poolAddress) {
    invalidatePoolSnapshot(params.poolAddress);
    invalidateSwapHistory(params.poolAddress);
  }

  return { signature, invalidated: params.poolAddress };
}

/**
 * A transaction the cluster would not take, said in a sentence.
 *
 * Solana reports these three ways — a `SendTransactionError` with simulation
 * logs, a bare `{ InstructionError: [i, ...] }` object from confirmation, and
 * an ordinary message — and none of them is something to put in front of
 * someone who is trying to buy $2 of a coin. What they need is which of the
 * handful of real causes it was.
 *
 * Anything unrecognised keeps its original text rather than being flattened
 * into a friendly non-answer. A wrong specific reason is worse than an
 * unfamiliar true one.
 */
function explainSubmitFailure(error: unknown): string {
  const logs: string[] =
    (error as { logs?: string[] } | null)?.logs ??
    (error as { transactionLogs?: string[] } | null)?.transactionLogs ??
    [];
  const text = [
    error instanceof Error ? error.message : "",
    typeof error === "object" && error !== null && !(error instanceof Error)
      ? JSON.stringify(error)
      : String(error ?? ""),
    logs.join("\n"),
  ].join("\n");

  if (/insufficient lamports|insufficient funds for rent|Transfer: insufficient/i.test(text)) {
    return "Not enough SOL in this wallet to cover the trade and its fees.";
  }
  if (/0x1771|SlippageToleranceExceeded|ExceededSlippage/i.test(text)) {
    return "The price moved past your slippage while this was being signed. Try again for a fresh quote.";
  }
  if (/Blockhash not found|block height exceeded|TransactionExpired/i.test(text)) {
    return "This quote expired before it was submitted. Try again for a fresh one.";
  }
  if (/already been processed|AlreadyProcessed/i.test(text)) {
    return "This transaction was already submitted.";
  }
  if (/PoolCompleted|CurveComplete|0x177(4|5)/i.test(text)) {
    return "This curve has finished. Trading continues in its migrated pool.";
  }
  if (/signature verification|missing required signature|Signature verification failed/i.test(text)) {
    return "The signature on this transaction did not verify. Try again.";
  }

  const first = error instanceof Error ? error.message : text.split("\n")[0];
  return first && first.trim().length > 0
    ? `The cluster refused this transaction: ${first.trim()}`
    : "The cluster refused this transaction.";
}
