import {
  BaseFeeMode,
  feeNumeratorToBps,
  getFeeNumeratorOnExponentialFeeScheduler,
  getFeeNumeratorOnLinearFeeScheduler,
  type PoolConfig,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import type BN from "bn.js";

/**
 * The economics a pool was configured with, read back off the config.
 *
 * Juno's presets promise two things a trader cannot otherwise verify: that the
 * opening fee decays to an equity-like spread, and that supply is split a
 * particular way between the curve, migration and leftover. Both are on-chain;
 * this reads them rather than repeating the preset's own marketing.
 */

export type FeePoint = { period: number; bps: number };

export type FeeSchedule = {
  /** Fee right now, in basis points. */
  currentBps: number;
  startBps: number;
  endBps: number;
  /** Periods elapsed since activation. */
  period: number;
  totalPeriods: number;
  /** Seconds until the fee reaches its floor; 0 once it has. */
  secondsRemaining: number;
  /** Sampled curve for plotting. */
  points: FeePoint[];
  mode: "linear" | "exponential";
};

type BaseFeeFields = {
  cliffFeeNumerator: BN;
  firstFactor: number;
  secondFactor: BN;
  thirdFactor: BN;
  baseFeeMode: number;
};

/** Signature is (cliffFeeNumerator: BN, reductionFactor: BN, period: number). */
function numeratorAt(base: BaseFeeFields, period: number): BN {
  return base.baseFeeMode === BaseFeeMode.FeeSchedulerLinear
    ? getFeeNumeratorOnLinearFeeScheduler(base.cliffFeeNumerator, base.thirdFactor, period)
    : getFeeNumeratorOnExponentialFeeScheduler(base.cliffFeeNumerator, base.thirdFactor, period);
}

/**
 * `firstFactor` is the number of periods, `secondFactor` the seconds per
 * period, `thirdFactor` the reduction factor — the on-chain names are
 * positional, which is why they are unpacked here once rather than at every
 * call site.
 */
export function feeSchedule(params: {
  config: PoolConfig;
  /** Unix seconds the pool activated at. */
  activationPoint: number;
  nowSeconds?: number;
}): FeeSchedule | null {
  const base = (params.config.poolFees as { baseFee: BaseFeeFields } | undefined)?.baseFee;
  if (!base) return null;

  const totalPeriods = base.firstFactor;
  const periodSeconds = Number(base.secondFactor.toString());
  if (totalPeriods <= 0 || periodSeconds <= 0) return null;

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, now - params.activationPoint);
  const period = Math.min(totalPeriods, Math.floor(elapsed / periodSeconds));

  const bpsAt = (p: number) => feeNumeratorToBps(numeratorAt(base, p));

  const sampleCount = Math.min(totalPeriods, 32);
  const points: FeePoint[] = Array.from({ length: sampleCount + 1 }, (_, i) => {
    const p = Math.round((i / sampleCount) * totalPeriods);
    return { period: p, bps: bpsAt(p) };
  });

  return {
    currentBps: bpsAt(period),
    startBps: bpsAt(0),
    endBps: bpsAt(totalPeriods),
    period,
    totalPeriods,
    secondsRemaining: Math.max(0, totalPeriods * periodSeconds - elapsed),
    points,
    mode: base.baseFeeMode === BaseFeeMode.FeeSchedulerLinear ? "linear" : "exponential",
  };
}

export type Tokenomics = {
  totalSupply: number;
  /** Sold along the bonding curve. */
  curveAmount: number;
  /** Seeded into the DAMM v2 pool at migration. */
  migrationAmount: number;
  /** Returned to the leftover receiver — the rounding buffer. */
  leftoverAmount: number;
  curvePct: number;
  migrationPct: number;
  leftoverPct: number;
};

/**
 * Where the supply actually goes.
 *
 * All three figures come from the config the program enforces, so this is what
 * will happen rather than what was intended.
 */
export function tokenomics(config: PoolConfig, baseDecimals: number): Tokenomics | null {
  const scale = 10 ** baseDecimals;
  const total = Number((config.preMigrationTokenSupply as BN)?.toString() ?? 0) / scale;
  const curve = Number((config.swapBaseAmount as BN)?.toString() ?? 0) / scale;
  const migration = Number((config.migrationBaseThreshold as BN)?.toString() ?? 0) / scale;
  if (total <= 0) return null;

  const leftover = Math.max(0, total - curve - migration);
  return {
    totalSupply: total,
    curveAmount: curve,
    migrationAmount: migration,
    leftoverAmount: leftover,
    curvePct: curve / total,
    migrationPct: migration / total,
    leftoverPct: leftover / total,
  };
}
