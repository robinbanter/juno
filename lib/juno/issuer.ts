/**
 * Issuer tooling: configure-and-monitor for the creator of a Juno pool.
 *
 * One code path, two front ends. The creator's Manage view in the app and the
 * `juno:inspect` / `juno:claim` / `juno:graduate` scripts all call the
 * functions below — the only difference between them is who signs (a browser
 * wallet or `.juno/launcher.json`). A transaction the CLI proves on devnet is
 * therefore the transaction the Claim and Migrate buttons send.
 *
 * Every number comes from the chain: the pool account, its config, and the
 * program's own fee metrics. Nothing here is restated from a preset's copy.
 */

import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  deriveDammV2PoolAddress,
  type PoolConfig,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PublicKey, type Keypair, type Transaction } from "@solana/web3.js";
import type BN from "bn.js";

import { curveShape, type CurveShape } from "./curve-shape";
import { CURVE_PRESET_LIST } from "./curves";
import {
  bnToUi,
  buildClaimCreatorFeesTransaction,
  fetchPoolSnapshot,
  getConnection,
  getDbcClient,
  invalidatePoolSnapshot,
  planMigration,
  sendTransaction,
  type PoolSnapshot,
} from "./dbc";
import { feeSchedule, type FeeSchedule } from "./economics";
import type { CurvePresetId } from "./types";

type Signer = (tx: Transaction) => Promise<Transaction>;

/** The pool account's inner state, typed over the fields read here. */
type PoolStateFields = {
  config: PublicKey;
  creator: PublicKey;
  baseMint: PublicKey;
  baseReserve: BN;
  quoteReserve: BN;
  sqrtPrice: BN;
  activationPoint: BN;
  isMigrated: number;
};

function stateOf(snapshot: PoolSnapshot): PoolStateFields {
  return (snapshot.pool as unknown as { poolState: PoolStateFields }).poolState;
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

/**
 * A pool address from either a base mint or a pool address.
 *
 * The CLI takes whichever the operator has to hand; the app always knows the
 * pool. A pool address resolves to itself only if it really is a DBC pool.
 */
export async function resolvePoolAddress(input: { mint?: string; pool?: string }): Promise<string> {
  const client = getDbcClient();
  if (input.pool) {
    const pool = await client.state.getPool(new PublicKey(input.pool));
    if (!pool) throw new Error(`${input.pool} is not a DBC pool on this cluster`);
    return input.pool;
  }
  if (input.mint) {
    const found = await client.state.getPoolByBaseMint(new PublicKey(input.mint));
    if (!found) throw new Error(`No DBC pool for mint ${input.mint} on this cluster`);
    return found.publicKey.toBase58();
  }
  throw new Error("Pass a base mint or a pool address");
}

/* ------------------------------------------------------------------ */
/* Monitor                                                             */
/* ------------------------------------------------------------------ */

export type CreatorFees = {
  /** Claimable right now, UI units. */
  quote: number;
  base: number;
};

export type PresetMatch = {
  id: CurvePresetId;
  label: string;
  tagline: string;
};

export type IssuerState = {
  pool: string;
  baseMint: string;
  config: string;
  quoteMint: string;
  /** The on-chain pool creator — the only key the program pays fees to. */
  creator: string;
  baseDecimals: number;
  quoteDecimals: number;

  /** Price of one base token, in quote units. */
  price: number;
  /** Quote held by the curve, UI units. */
  quoteReserve: number;
  /** Base still on the curve, UI units. */
  baseReserve: number;
  /** `migrationQuoteThreshold`, UI units — what the reserve must reach. */
  migrationThreshold: number;
  /** quoteReserve / migrationThreshold, 0..1. */
  progress: number;
  graduated: boolean;
  /** The curve is full and waiting for someone to migrate it. */
  readyToGraduate: boolean;

  fee: FeeSchedule | null;
  /** Which Juno preset the config matches, or null for a config Juno did not write. */
  preset: PresetMatch | null;
  /** The sixteen-segment liquidity shape, from the config's own curve array. */
  shape: CurveShape;

  migrationFeeOption: number;
  /** The DAMM v2 config this pool graduates into. */
  dammConfig: string | null;
  /** Where the DAMM v2 pool lives (or will), derived from the config. */
  dammPool: string | null;

  /** Null when the fee metrics read failed — not the same as zero. */
  claimable: CreatorFees | null;
  /** Unix ms of the read. */
  readAt: number;
};

/**
 * Identify the Juno preset behind a config from what the program enforces.
 *
 * The registry records which preset a launch asked for; this checks what the
 * chain actually holds. The fee schedule's opening fee, its decay duration and
 * the DAMM v2 fee tier together are unique per preset.
 */
export function presetFromConfig(
  config: PoolConfig,
  fee: FeeSchedule | null,
): PresetMatch | null {
  if (!fee) return null;
  const base = (config.poolFees as { baseFee?: { firstFactor: number; secondFactor: BN } })
    .baseFee;
  if (!base) return null;
  const duration = base.firstFactor * Number(base.secondFactor.toString());
  const tier = Number(config.migrationFeeOption);

  const match = CURVE_PRESET_LIST.find(
    (p) =>
      p.startingFeeBps === fee.startBps &&
      p.feeDecaySeconds === duration &&
      Number(p.migrationFeeOption) === tier,
  );
  return match ? { id: match.id, label: match.label, tagline: match.tagline } : null;
}

/**
 * The DAMM v2 config and pool a DBC pool graduates into.
 *
 * Read off the pool's own `migrationFeeOption`, never a caller's assumption
 * about its preset — the CLI once defaulted to `content`, which is the wrong
 * fee tier for three of the four presets.
 */
export function dammTarget(params: {
  migrationFeeOption: number;
  baseMint: string;
  quoteMint: string;
}): { config: PublicKey; pool: PublicKey } | null {
  const config = DAMM_V2_MIGRATION_FEE_ADDRESS[params.migrationFeeOption];
  if (!config) return null;
  return {
    config,
    pool: deriveDammV2PoolAddress(
      config,
      new PublicKey(params.baseMint),
      new PublicKey(params.quoteMint),
    ),
  };
}

/** The creator's claimable trading fees, from the program's own metrics. */
async function readClaimable(snapshot: PoolSnapshot): Promise<CreatorFees | null> {
  const metrics = await getDbcClient()
    .state.getPoolFeeMetrics(snapshot.poolAddress)
    .catch(() => null);
  if (!metrics) return null;
  return {
    quote: bnToUi(metrics.current.creatorQuoteFee, snapshot.quoteDecimals),
    base: bnToUi(metrics.current.creatorBaseFee, snapshot.baseDecimals),
  };
}

/**
 * Everything the Manage view and `juno:inspect` show, in one read.
 *
 * `fresh` bypasses the few-second snapshot cache — right after a claim or a
 * migration, the cached copy is exactly the one that is wrong.
 */
export async function readIssuerState(
  pool: string,
  options: { fresh?: boolean; nowSeconds?: number } = {},
): Promise<IssuerState | null> {
  if (options.fresh) invalidatePoolSnapshot(pool);
  const snapshot = await fetchPoolSnapshot(pool);
  if (!snapshot) return null;

  const state = stateOf(snapshot);
  const { config, baseDecimals, quoteDecimals } = snapshot;
  const baseMint = state.baseMint.toBase58();
  const quoteMint = config.quoteMint.toBase58();

  const migrationThreshold = bnToUi(config.migrationQuoteThreshold as BN, quoteDecimals);
  const quoteReserve = bnToUi(state.quoteReserve, quoteDecimals);
  const graduated = state.isMigrated !== 0;

  const fee = feeSchedule({
    config,
    activationPoint: Number(state.activationPoint.toString()),
    nowSeconds: options.nowSeconds,
  });

  const migrationFeeOption = Number(config.migrationFeeOption);
  const damm = dammTarget({ migrationFeeOption, baseMint, quoteMint });

  return {
    pool,
    baseMint,
    config: state.config.toBase58(),
    quoteMint,
    creator: state.creator.toBase58(),
    baseDecimals,
    quoteDecimals,
    price: snapshot.price,
    quoteReserve,
    baseReserve: bnToUi(state.baseReserve, baseDecimals),
    migrationThreshold,
    progress: snapshot.curve.progress,
    graduated,
    readyToGraduate: !graduated && snapshot.curve.progress >= 1,
    fee,
    preset: presetFromConfig(config, fee),
    shape: curveShape({
      config,
      baseDecimals,
      quoteDecimals,
      currentSqrtPrice: state.sqrtPrice,
    }),
    migrationFeeOption,
    dammConfig: damm?.config.toBase58() ?? null,
    dammPool: damm?.pool.toBase58() ?? null,
    claimable: await readClaimable(snapshot),
    readAt: Date.now(),
  };
}

/** Whether the DAMM v2 pool account exists yet — proof migration landed. */
export async function dammPoolExists(address: string): Promise<boolean> {
  const info = await getConnection().getAccountInfo(new PublicKey(address));
  return info !== null;
}

/* ------------------------------------------------------------------ */
/* Claim                                                               */
/* ------------------------------------------------------------------ */

export type ClaimPlan = {
  transaction: Transaction;
  before: CreatorFees;
};

/**
 * Build the fee claim, refusing the cases the program would reject anyway —
 * a signer who is not the pool's creator, or nothing to claim — so nobody
 * pays a network fee to find out.
 */
export async function planCreatorClaim(params: {
  pool: string;
  creator: PublicKey;
}): Promise<ClaimPlan> {
  const state = await readIssuerState(params.pool, { fresh: true });
  if (!state) throw new Error(`Pool ${params.pool} is not readable`);
  if (state.creator !== params.creator.toBase58()) {
    throw new Error(
      `Only the pool's creator (${state.creator}) can claim its trading fees.`,
    );
  }
  if (!state.claimable) throw new Error("Could not read the pool's fee metrics. Try again.");
  if (state.claimable.quote <= 0 && state.claimable.base <= 0) {
    throw new Error("Nothing to claim yet.");
  }

  return {
    transaction: await buildClaimCreatorFeesTransaction({
      creator: params.creator,
      pool: params.pool,
    }),
    before: state.claimable,
  };
}

export type ClaimReceipt = {
  signature: string;
  /** Claimable when the transaction was built — the most it could move. */
  requested: CreatorFees;
  /**
   * What moved, measured from the program's metrics before and after. Null
   * when the post-claim read failed — a rate-limited RPC is not evidence that
   * everything was paid out, however likely that is.
   */
  claimed: CreatorFees | null;
  remaining: CreatorFees | null;
};

/**
 * Re-read claimable fees after a confirmed transaction. The public RPC tends
 * to 429 a read that lands right behind a send, so one retry after a pause.
 */
async function readRemaining(pool: string): Promise<CreatorFees | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const state = await readIssuerState(pool, { fresh: true }).catch(() => null);
    if (state?.claimable) return state.claimable;
  }
  return null;
}

/** Claim a creator's accrued trading fees, and report what actually moved. */
export async function claimCreatorFees(params: {
  pool: string;
  creator: PublicKey;
  signTransaction: Signer;
  onSent?: (signature: string) => void;
}): Promise<ClaimReceipt> {
  const plan = await planCreatorClaim(params);
  const signature = await sendTransaction({
    transaction: plan.transaction,
    payer: params.creator,
    signTransaction: params.signTransaction,
    onSent: params.onSent,
  });

  const remaining = await readRemaining(params.pool);
  return {
    signature,
    requested: plan.before,
    claimed: remaining
      ? {
          quote: Math.max(0, plan.before.quote - remaining.quote),
          base: Math.max(0, plan.before.base - remaining.base),
        }
      : null,
    remaining,
  };
}

/* ------------------------------------------------------------------ */
/* Graduation                                                          */
/* ------------------------------------------------------------------ */

export type GraduationPlan = {
  transaction: Transaction;
  signers: Keypair[];
  dammConfig: string;
  dammPool: string;
};

/**
 * Build the DAMM v2 migration for a full curve.
 *
 * Gated on the program's own progress figure — the program rejects an early
 * migration, and the migration fee tier comes from the pool's config, not
 * from anything the caller claims about it.
 */
export async function planGraduation(params: {
  pool: string;
  payer: PublicKey;
}): Promise<GraduationPlan> {
  const state = await readIssuerState(params.pool, { fresh: true });
  if (!state) throw new Error(`Pool ${params.pool} is not readable`);
  if (state.graduated) throw new Error("This pool has already migrated to DAMM v2.");
  if (!state.readyToGraduate) {
    throw new Error(
      `The curve is at ${(state.progress * 100).toFixed(4)}%; migration opens at 100%.`,
    );
  }
  if (!state.dammConfig || !state.dammPool) {
    throw new Error(`No DAMM v2 config for migration fee option ${state.migrationFeeOption}`);
  }

  const plan = await planMigration({
    payer: params.payer,
    pool: params.pool,
    dammConfig: new PublicKey(state.dammConfig),
  });
  return { ...plan, dammConfig: state.dammConfig, dammPool: state.dammPool };
}

export type GraduationReceipt = {
  signature: string;
  dammPool: string;
  graduated: boolean;
};

/** Migrate a completed curve into its DAMM v2 pool. */
export async function graduatePool(params: {
  pool: string;
  payer: PublicKey;
  signTransaction: Signer;
  onSent?: (signature: string) => void;
}): Promise<GraduationReceipt> {
  const plan = await planGraduation(params);
  const signature = await sendTransaction({
    transaction: plan.transaction,
    payer: params.payer,
    signTransaction: params.signTransaction,
    signers: plan.signers,
    onSent: params.onSent,
  });

  const after = await readIssuerState(params.pool, { fresh: true }).catch(() => null);
  return { signature, dammPool: plan.dammPool, graduated: after?.graduated ?? true };
}

