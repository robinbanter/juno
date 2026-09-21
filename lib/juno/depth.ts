import "server-only";

import { curvePoint, quoteTrade, type PoolSnapshot } from "./dbc";
import type BN from "bn.js";

/**
 * How much this curve can take.
 *
 * A bonding curve moves as it fills, so "the price" is only the price of an
 * infinitesimal trade. Every other size clears higher — and how much higher is
 * the single most useful thing a trader can know about a curve, because it is
 * the whole difference between the four presets this app offers.
 *
 * Both functions here quote against the *live* curve through the same
 * `swapQuote` the transaction builder uses. Nothing is modelled or
 * approximated: the numbers are what the program would actually give you at
 * that size, this second.
 */

export type DepthPoint = {
  /** Input size, in quote units for a buy and base units for a sell. */
  amountIn: number;
  amountOut: number;
  /** Realised price of the whole fill — not the spot price. */
  averagePrice: number;
  /** Total shortfall against spot, fee included: 0.012 is 1.2%. */
  priceImpact: number;
  /** The part of that the curve caused, with the fee taken out. */
  curveImpact: number;
  /** Trading fee on this size, in quote units. */
  fee: number;
};

/**
 * The largest input this curve will still quote, at or below `ceiling`.
 *
 * `swapQuote` throws once the input exceeds what the curve has left, and on a
 * young pool that limit is thousands of times below any sensible ceiling. Both
 * functions below need a real upper bound before they can do anything useful:
 * without one, a sampler spends every point on sizes that cannot happen and a
 * binary search spends every probe halving an empty range.
 *
 * Found by doubling up from a small size and then bisecting, so the cost is
 * logarithmic in how far off the ceiling was rather than linear.
 */
async function largestFillable(
  probe: (amountIn: number) => Promise<unknown | null>,
  floor: number,
  ceiling: number,
): Promise<number | null> {
  if (await probe(ceiling)) return ceiling;
  if (!(await probe(floor))) return null;

  let low = floor;
  let high = ceiling;
  // Grow first: the true limit is usually far closer to the floor than to the
  // ceiling, and doubling finds its order of magnitude in a handful of probes.
  for (let size = floor * 2; size < ceiling; size *= 2) {
    if (await probe(size)) low = size;
    else {
      high = size;
      break;
    }
  }

  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    if (await probe(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Sample the curve across sizes, for a depth chart.
 *
 * Logarithmically spaced, because impact on a curve is not linear in size and
 * an evenly spaced sample spends most of its points in the flat part. The top
 * of the range is the largest size the curve will actually fill rather than the
 * caller's ceiling — sampling past it drew nothing, so a twelve-point chart
 * came back with four.
 */
export async function sampleDepth(
  snapshot: PoolSnapshot,
  side: "buy" | "sell",
  /** Largest size to consider, in the input token's UI units. */
  max: number,
  steps = 12,
): Promise<DepthPoint[]> {
  if (!(max > 0)) return [];

  // One read for the whole sample. See `quoteTrade`'s `currentPoint`: without
  // this, every probe was an RPC call and the ones the endpoint throttled were
  // indistinguishable from sizes the curve could not fill.
  const point = await currentPointOrNull();
  const quoteAt = async (amountIn: number) => {
    const quote = await quoteTrade({ snapshot, side, amountIn, currentPoint: point }).catch(
      () => null,
    );
    return quote && quote.amountOut > 0 ? quote : null;
  };

  const top = await largestFillable(quoteAt, max / 100_000, max);
  if (top === null) return [];

  const min = top / 1000;
  const points: DepthPoint[] = [];

  for (let i = 0; i < steps; i += 1) {
    const amountIn = min * Math.pow(top / min, i / (steps - 1));
    const quote = await quoteAt(amountIn);
    if (!quote) continue;
    points.push({
      amountIn,
      amountOut: quote.amountOut,
      averagePrice: side === "buy" ? amountIn / quote.amountOut : quote.amountOut / amountIn,
      priceImpact: quote.priceImpact,
      curveImpact: quote.curveImpact,
      fee: quote.fee,
    });
  }

  return points;
}

export type SizeSuggestion = {
  /** The largest input that stays inside the impact budget. */
  amountIn: number;
  amountOut: number;
  /** Total shortfall at that size, fee included — what it actually costs. */
  priceImpact: number;
  /** What the search was run on: curve movement, with the fee excluded. */
  curveImpact: number;
  fee: number;
  averagePrice: number;
  /**
   * True when the whole range this curve can fill stays inside the budget, so
   * the answer is bounded by the curve rather than by the budget. Saying so
   * matters: "you can buy this much without moving it 1%" is a different claim
   * from "this is all there is to buy".
   */
  ceilingReached: boolean;
};

/**
 * The largest trade that stays under a chosen price impact.
 *
 * Binary-searched rather than solved. The curve's closed form is the SDK's
 * business and changes with the config's fee schedule, its sixteen liquidity
 * segments and the activation point; asking the same quoting function the
 * transaction uses is both simpler and exactly right, and each probe is local
 * arithmetic over an already-fetched account — no round trip per step.
 *
 * Returns null when even the smallest probe exceeds the budget, which is a real
 * answer on a thin curve: there is no size that small a move allows.
 */
export async function suggestSize(
  snapshot: PoolSnapshot,
  side: "buy" | "sell",
  /**
   * Budget as a ratio: 0.01 for 1%. Measured on *curve movement*, not on total
   * cost — the fee is a constant percentage that does not grow with size, so
   * searching on it would mostly be searching on a constant.
   */
  budget: number,
  /** Where to stop looking, in input units. */
  ceiling: number,
  probes = 16,
): Promise<SizeSuggestion | null> {
  if (!(budget > 0) || !(ceiling > 0)) return null;

  const point = await currentPointOrNull();
  const at = async (amountIn: number) => {
    const quote = await quoteTrade({ snapshot, side, amountIn, currentPoint: point }).catch(
      () => null,
    );
    if (!quote || !(quote.amountOut > 0)) return null;
    return {
      amountIn,
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
      curveImpact: quote.curveImpact,
      fee: quote.fee,
      averagePrice: side === "buy" ? amountIn / quote.amountOut : quote.amountOut / amountIn,
    };
  };

  const floor = ceiling / 100_000;
  const smallest = await at(floor);
  if (!smallest || smallest.curveImpact > budget) return null;

  // Search inside what the curve can actually fill. Bisecting against a
  // ceiling the curve refuses spends every probe halving empty range and
  // returns the floor — which reads as "you can barely trade here" on a pool
  // that would happily take sixty times more.
  const top = await largestFillable(at, floor, ceiling);
  if (top === null) return null;

  const atTop = await at(top);
  if (atTop && atTop.curveImpact <= budget) {
    return { ...atTop, ceilingReached: true };
  }

  let low = floor;
  let high = top;
  let best = smallest;

  for (let i = 0; i < probes; i += 1) {
    const mid = (low + high) / 2;
    const quote = await at(mid);
    if (quote && quote.curveImpact <= budget) {
      best = quote;
      low = mid;
    } else {
      high = mid;
    }
  }

  return { ...best, ceilingReached: false };
}

/**
 * The activation point, or nothing.
 *
 * Nothing is a usable answer: `quoteTrade` falls back to reading it itself, so
 * a failure here costs speed rather than correctness.
 */
async function currentPointOrNull(): Promise<BN | undefined> {
  return curvePoint().catch(() => undefined);
}
