import {
  buildCurveWithLiquidityWeights,
  getPriceFromSqrtPrice,
  type PoolConfig,
  TokenDecimal,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";

import { buildPresetParams } from "./curves";
import type { CurvePresetId } from "./types";

/**
 * The shape of a pool's bonding curve, read off its config.
 *
 * Every Juno preset places sixteen segments with a liquidity weight each, and
 * that shape is the whole substance of the launch — yet it was invisible in
 * the product. This turns the on-chain `curve` array into something plottable.
 *
 * Derived from the config's own `sqrtPrice` / `liquidity` points rather than
 * the SDK's `getCurveBreakdown`, which assumes an untouched curve and throws
 * `SafeMath: subtraction overflow` once a pool has been traded.
 */

export type CurvePoint = {
  /** Segment index, 0-based. */
  index: number;
  /** Price in quote units per base token at this segment's upper bound. */
  price: number;
  /** Raw liquidity placed in the segment. */
  liquidity: number;
  /** Liquidity as a share of the largest segment, 0..1 — the shape. */
  weight: number;
};

export type CurveShape = {
  points: CurvePoint[];
  startPrice: number;
  endPrice: number;
  /** Where the pool is trading now, if known. */
  currentPrice?: number;
};

function priceAt(sqrtPrice: BN, baseDecimals: number, quoteDecimals: number): number {
  return getPriceFromSqrtPrice(
    sqrtPrice,
    baseDecimals as TokenDecimal,
    quoteDecimals as TokenDecimal,
  ).toNumber();
}

/**
 * The subset of a config the shape needs. Satisfied both by an on-chain
 * `PoolConfig` and by the `ConfigParameters` `buildCurve*` returns, so a curve
 * can be plotted before its pool exists.
 */
export type ShapeableConfig = {
  curve: Array<{ sqrtPrice: BN; liquidity: BN }>;
  sqrtStartPrice: BN;
};

export function curveShape(params: {
  config: ShapeableConfig | PoolConfig;
  baseDecimals: number;
  quoteDecimals: number;
  currentSqrtPrice?: BN;
}): CurveShape {
  const { baseDecimals, quoteDecimals } = params;
  const config = params.config as ShapeableConfig;
  const raw = (config.curve ?? []) as Array<{ sqrtPrice: BN; liquidity: BN }>;

  // The program pads unused segments with zero liquidity; those are not part
  // of the shape the issuer chose.
  const used = raw.filter((p) => !p.liquidity.isZero());

  const liquidities = used.map((p) => Number(p.liquidity.toString()));
  const maxLiquidity = Math.max(1, ...liquidities);

  const points: CurvePoint[] = used.map((p, index) => ({
    index,
    price: priceAt(p.sqrtPrice, baseDecimals, quoteDecimals),
    liquidity: liquidities[index],
    weight: liquidities[index] / maxLiquidity,
  }));

  return {
    points,
    startPrice: priceAt(config.sqrtStartPrice, baseDecimals, quoteDecimals),
    endPrice: points.length ? points[points.length - 1].price : 0,
    currentPrice: params.currentSqrtPrice
      ? priceAt(params.currentSqrtPrice, baseDecimals, quoteDecimals)
      : undefined,
  };
}


/**
 * The shape a preset would produce, computed locally.
 *
 * `buildCurveWithLiquidityWeights` is pure maths — no RPC, no pool — so an
 * issuer can see the curve they are about to create before they pay for it.
 */
export function presetShape(params: {
  preset: CurvePresetId;
  initialMarketCap: number;
  migrationMarketCap: number;
  quoteDecimals: number;
}): CurveShape | null {
  try {
    const config = buildCurveWithLiquidityWeights(
      buildPresetParams({
        preset: params.preset,
        initialMarketCap: params.initialMarketCap,
        migrationMarketCap: params.migrationMarketCap,
        quoteDecimals: params.quoteDecimals as TokenDecimal,
      }),
    );
    return curveShape({
      config: config as unknown as ShapeableConfig,
      baseDecimals: 6,
      quoteDecimals: params.quoteDecimals,
    });
  } catch {
    // An invalid valuation pair (migration below initial) throws in the
    // builder; the form surfaces that separately.
    return null;
  }
}
