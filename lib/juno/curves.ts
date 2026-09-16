/**
 * Juno's bonding-curve presets.
 *
 * This is the part of Juno that is not a memecoin launchpad. Meteora's DBC
 * lets you place up to sixteen curve segments and weight the liquidity in
 * each (`buildCurveWithLiquidityWeights`), and the weights are what give a
 * launch its character:
 *
 *   more liquidity in a segment  →  more supply absorbed per unit of price
 *                               →  a flatter stretch of curve
 *
 * A memecoin launch back-loads its weights: nearly free at the start, near
 * vertical at the end, graduate as fast as possible. An equity-like launch
 * wants the opposite properties in different places — a deep book near the
 * issue price so early size does not gap the print, real price discovery in
 * the middle, and a flattening near the target cap so the pool does not moon
 * away from the underlying before it graduates.
 *
 * Each preset below is a full `BuildCurveBaseParams` plus the sixteen weights.
 * Feed one to `buildCurveWithLiquidityWeights()` to get `ConfigParameters`,
 * then to `partner.createConfig()`.
 *
 * @see https://docs.meteora.ag/developer-guides/dbc
 */

import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenDecimal,
  TokenType,
  TokenAuthorityOption,
  type BuildCurveWithLiquidityWeightsParams,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

import type { CurvePresetId } from "./types";

/** DBC places at most sixteen curve points. */
export const CURVE_SEGMENTS = 16;

/** One billion tokens, the convention for a launch of this kind. */
export const DEFAULT_TOTAL_SUPPLY = 1_000_000_000;

/** Share of supply reserved as the builder's rounding buffer. */
const LEFTOVER_RATIO = 0.01;

export type CurvePreset = {
  id: CurvePresetId;
  label: string;
  /** One line, shown under the preset in the launch form. */
  tagline: string;
  /** Why an issuer would pick this, shown on the detail panel. */
  rationale: string;
  /** Sixteen liquidity weights — the shape of the curve. */
  weights: number[];
  /** Fee at t=0, decaying to `endingFeeBps` over `feeDecaySeconds`. */
  startingFeeBps: number;
  endingFeeBps: number;
  feeDecaySeconds: number;
  /** Fee tier of the DAMM v2 pool the curve graduates into. */
  migrationFeeOption: MigrationFeeOption;
  /** Share of supply sold on the curve before migration. */
  percentageSupplyOnMigration: number;
  /**
   * Equity presets hold the curve price to a band around a reference feed.
   * Advisory in the UI — the on-chain graduation trigger is still the
   * migration quote threshold — but it is what makes the launch equity-like.
   */
  navBandBps?: number;
};

/**
 * Geometric weights. `ratio > 1` back-loads liquidity (flat late, steep
 * early); `ratio < 1` front-loads it (deep near the issue price).
 */
function geometric(ratio: number, segments = CURVE_SEGMENTS): number[] {
  return Array.from({ length: segments }, (_, i) => Number(Math.pow(ratio, i).toFixed(6)));
}

/**
 * A book-shaped curve: a deep flat stretch to absorb the opening auction, a
 * thin middle where price is actually discovered, then depth again near the
 * target cap so the last buyers do not pay a vertical.
 */
function bookShaped(segments = CURVE_SEGMENTS): number[] {
  const mid = (segments - 1) / 2;
  return Array.from({ length: segments }, (_, i) => {
    // Parabola in [0,1]: 1 at the edges, ~0.25 in the middle.
    const t = (i - mid) / mid;
    return Number((0.25 + 0.75 * t * t).toFixed(6));
  });
}

export const CURVE_PRESETS: Record<CurvePresetId, CurvePreset> = {
  /**
   * The default for a Juno post. Closest to a conventional content coin:
   * cheap to mint into, graduates on modest volume.
   */
  content: {
    id: "content",
    label: "Content",
    tagline: "Default for posts. Cheap entry, graduates on modest volume.",
    rationale:
      "Back-loaded liquidity so early collectors get in cheaply and the curve steepens as the post finds an audience. Fees start high to blunt snipers in the first few minutes, then settle to 1%.",
    weights: geometric(1.2),
    startingFeeBps: 900,
    endingFeeBps: 100,
    feeDecaySeconds: 600,
    migrationFeeOption: MigrationFeeOption.FixedBps100,
    percentageSupplyOnMigration: 20,
  },

  /**
   * A newly tokenized, thinly traded name. The failure mode here is a single
   * $500 order gapping the print 40%, so liquidity is front-loaded hard.
   */
  "thin-name": {
    id: "thin-name",
    label: "Thin name",
    tagline: "Newly tokenized, low float. Deep at the issue price.",
    rationale:
      "Front-loaded liquidity gives a deep book at the issue price, so early size fills without gapping the print — the main risk for a name with no existing market. Price only starts moving once real demand clears the opening depth.",
    weights: geometric(0.82),
    startingFeeBps: 500,
    endingFeeBps: 60,
    feeDecaySeconds: 900,
    migrationFeeOption: MigrationFeeOption.FixedBps30,
    percentageSupplyOnMigration: 35,
    navBandBps: 500,
  },

  /**
   * Book-building: depth at the opening, discovery in the middle, depth again
   * at the target cap. The shape of an IPO order book, not a memecoin.
   */
  "ipo-book": {
    id: "ipo-book",
    label: "IPO book",
    tagline: "Deep open, real discovery mid-curve, flat near the target cap.",
    rationale:
      "A book-shaped curve: depth at the open to absorb the initial auction, a thin middle where price is genuinely discovered, then depth again approaching the target cap so the pool does not moon into nonsense before it graduates.",
    weights: bookShaped(),
    startingFeeBps: 400,
    endingFeeBps: 50,
    feeDecaySeconds: 900,
    migrationFeeOption: MigrationFeeOption.FixedBps30,
    percentageSupplyOnMigration: 30,
    navBandBps: 400,
  },

  /**
   * Near-constant price. For a token that is supposed to track an underlying,
   * a curve that runs away from NAV is a bug, not a feature.
   */
  "tight-nav": {
    id: "tight-nav",
    label: "Tight NAV",
    tagline: "Near-flat curve for assets that should track an underlying.",
    rationale:
      "Uniform liquidity across all sixteen segments keeps the curve close to flat, so the pool price stays near the reference feed instead of drifting off it. Paired with the tightest fee tier, this behaves like a spread rather than a launch.",
    weights: Array.from({ length: CURVE_SEGMENTS }, () => 1),
    startingFeeBps: 200,
    endingFeeBps: 25, // MIN_FEE_BPS
    feeDecaySeconds: 300,
    migrationFeeOption: MigrationFeeOption.FixedBps25,
    percentageSupplyOnMigration: 50,
    navBandBps: 200,
  },
};

export const CURVE_PRESET_LIST: CurvePreset[] = Object.values(CURVE_PRESETS);

export type BuildPresetOptions = {
  preset: CurvePresetId;
  /** Fully diluted valuation at the first trade, in quote-token units. */
  initialMarketCap: number;
  /** FDV at which the curve completes and migrates to DAMM v2. */
  migrationMarketCap: number;
  /** Decimals of the quote mint — 6 for USDC, 9 for SOL. */
  quoteDecimals: TokenDecimal;
  /** Total supply in UI units. */
  totalTokenSupply?: number;
  /**
   * Supply held back as a rounding buffer, in UI units. Defaults to 1% of
   * total supply. See the note in `buildPresetParams`.
   */
  leftover?: number;
  /** Token-2022 for xStock-style quote pairs; SPL otherwise. */
  tokenType?: TokenType;
  /** Share of trading fees routed to the creator, 0-100. */
  creatorFeeShare?: number;
};

/**
 * Turn a preset into the exact argument `buildCurveWithLiquidityWeights()`
 * wants. Kept separate from the preset table so the shape data stays readable
 * and the plumbing stays in one place.
 */
export function buildPresetParams(
  opts: BuildPresetOptions,
): BuildCurveWithLiquidityWeightsParams {
  const preset = CURVE_PRESETS[opts.preset];
  const totalTokenSupply = opts.totalTokenSupply ?? DEFAULT_TOTAL_SUPPLY;

  return {
    token: {
      tokenType: opts.tokenType ?? TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: opts.quoteDecimals,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply,
      // Not optional, despite reading like a nicety. The builder derives the
      // supply the curve actually consumes from the curve itself, and when
      // that lands above `totalTokenSupply` the excess has to fit inside
      // `leftover` or it throws `leftOverDelta must be less than
      // totalLeftover`. One percent absorbs the rounding across all sixteen
      // segments with room to spare; anything left over at migration goes to
      // the config's leftover receiver.
      leftover: opts.leftover ?? Math.floor(totalTokenSupply * LEFTOVER_RATIO),
    },
    fee: {
      baseFeeParams: {
        // Exponential decay, not RateLimiter — RateLimiter is deprecated for
        // new configs and would fail validation.
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: {
          startingFeeBps: preset.startingFeeBps,
          endingFeeBps: preset.endingFeeBps,
          numberOfPeriod: 60,
          totalDuration: preset.feeDecaySeconds,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: opts.creatorFeeShare ?? 50,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: preset.migrationFeeOption,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: preset.endingFeeBps,
      },
    },
    liquidityDistribution: {
      // Permanently locked so the graduated pool keeps a floor of liquidity
      // rather than letting the creator pull it on day one.
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: opts.initialMarketCap,
    migrationMarketCap: opts.migrationMarketCap,
    liquidityWeights: preset.weights,
  };
}
