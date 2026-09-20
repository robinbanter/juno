import "server-only";

import { PublicKey } from "@solana/web3.js";

import { fetchPoolSnapshot, getConnection, vaultsOf } from "./dbc";
import { quoteTokenUsdPrice } from "./pyth";
import { listPools } from "./registry";
import { tryRead } from "./rpc";
import { CallerError } from "./api";
import { listSwapHistory } from "./swaps";
import type { JunoPoolRow } from "./registry";

/**
 * What a wallet holds, and what it paid.
 *
 * The balance is read from the wallet's token accounts — that is the truth
 * about ownership. The *cost* is not on the balance anywhere, so it is derived
 * from the same decoded swap history that drives the charts: every buy this
 * wallet made against a Juno pool added tokens at a known price, every sell
 * removed them.
 *
 * ## Average cost, and why
 *
 * Realised P&L needs a lot matching policy, and the honest ones disagree with
 * each other — FIFO and average cost give different answers for the same
 * trades. This uses **average cost**: a sell reduces the position and the cost
 * basis proportionally, leaving the average unchanged.
 *
 * That choice matters because it is the one that cannot mislead here. FIFO
 * would let a creator realise a gain by selling their earliest, cheapest tokens
 * while the position is underwater overall — a number that is technically true
 * and tells the holder the opposite of their actual situation.
 *
 * ## What this cannot see
 *
 * Tokens acquired any way other than a swap against the pool — an airdrop, a
 * transfer from a friend, a buy made before the visible history window — are
 * held but have no recorded cost. Those are reported with a null cost basis
 * rather than a zero, because a zero cost implies the entire holding is profit.
 */

export type Position = {
  baseMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  curvePreset: string;
  /** Tokens held right now, in UI units. */
  balance: number;
  /** Current price, one token in `currency`. */
  price: number;
  /** `balance * price`. */
  value: number;
  /**
   * Average price paid per token, or null when this wallet's acquisition is not
   * in the visible swap history.
   */
  averageCost: number | null;
  /** `value - (balance * averageCost)`, or null when cost is unknown. */
  unrealisedPnl: number | null;
  /** As a signed ratio, or null when cost is unknown. */
  unrealisedPnlPct: number | null;
  /** Profit already taken, from sells matched against average cost. */
  realisedPnl: number;
  /** What the figures above are denominated in — "USD" or the quote symbol. */
  currency: string;
  graduated: boolean;
  /**
   * This wallet's own trades against the pool, oldest first. Kept so the
   * portfolio's value over time can be rebuilt without re-reading the chain.
   */
  trades: Array<{ t: string; side: "buy" | "sell"; base: number; price: number }>;
};

export type Portfolio = {
  wallet: string;
  positions: Position[];
  /** Sum of position values, in USD where every position could be priced in USD. */
  totalValue: number;
  /** Null when any held position has no recorded cost. */
  totalPnl: number | null;
  totalPnlPct: number | null;
  currency: string;
  /**
   * True when some pool's history could not be fully read, so cost figures may
   * be incomplete. The UI says so rather than presenting a partial basis as
   * final.
   */
  partial: boolean;
  /**
   * What this wallet was worth over time, oldest first.
   *
   * Nothing stores this, and nothing needs to: every position's balance history
   * is implied by its trades, and every price is implied by the trade that set
   * it. Replaying both together reconstructs the total at each moment something
   * actually happened.
   *
   * The series therefore has a point per *trade*, not per interval — a flat
   * stretch means nobody traded, which is the truth, rather than a smoothed
   * line through prices nobody paid.
   */
  history: Array<{ t: string; value: number }>;
};

type Basis = {
  /** Tokens acquired and still held, per average-cost accounting. */
  quantity: number;
  /** Total quote paid for `quantity`. */
  cost: number;
  realised: number;
  /** True when at least one buy by this wallet was seen. */
  seen: boolean;
};

/**
 * Walk this wallet's trades oldest-first, maintaining an average-cost basis.
 *
 * A sell is matched against the running average, which is what keeps realised
 * and unrealised P&L consistent with each other.
 */
export function basisFromSwaps(
  swaps: Array<{ side: "buy" | "sell"; baseAmount: number; quoteAmount: number; slot: number }>,
): Basis {
  const ordered = [...swaps].sort((a, b) => a.slot - b.slot);
  const basis: Basis = { quantity: 0, cost: 0, realised: 0, seen: false };

  for (const swap of ordered) {
    if (swap.side === "buy") {
      basis.quantity += swap.baseAmount;
      basis.cost += swap.quoteAmount;
      basis.seen = true;
      continue;
    }

    // Selling more than the tracked position means part of it was acquired
    // outside the visible history. Only the tracked part has a cost to match.
    const matched = Math.min(swap.baseAmount, basis.quantity);
    if (basis.quantity > 0 && matched > 0) {
      const average = basis.cost / basis.quantity;
      const proceeds = swap.quoteAmount * (matched / swap.baseAmount);
      basis.realised += proceeds - average * matched;
      basis.quantity -= matched;
      basis.cost -= average * matched;
    }
  }

  // Floating-point drift on a fully closed position leaves a residue that
  // would otherwise divide into an absurd average.
  if (basis.quantity < 1e-9) {
    basis.quantity = 0;
    basis.cost = 0;
  }

  return basis;
}

/** Token balance this wallet holds of one mint, in UI units. */
async function balanceOf(wallet: string, mint: string): Promise<number> {
  const accounts = await tryRead(() =>
    getConnection().getParsedTokenAccountsByOwner(new PublicKey(wallet), {
      mint: new PublicKey(mint),
    }),
  );
  if (!accounts) return 0;

  return accounts.value.reduce((sum, account) => {
    const amount = (
      account.account.data.parsed as {
        info?: { tokenAmount?: { uiAmount?: number | null } };
      }
    ).info?.tokenAmount?.uiAmount;
    return sum + (amount ?? 0);
  }, 0);
}

async function positionFor(
  wallet: string,
  row: JunoPoolRow,
): Promise<{ position: Position | null; partial: boolean }> {
  const balance = await balanceOf(wallet, row.baseMint);

  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);
  const rate = quoteUsd ?? 1;
  const currency = quoteUsd === null ? (row.quoteMint === WSOL_MINT ? "SOL" : "USDC") : "USD";

  const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
  if (!snapshot) return { position: null, partial: false };

  // History is only worth reading for a pool this wallet actually holds.
  const history = balance > 0 ? await listSwapHistory(row.poolAddress, vaultsOf(snapshot)) : null;
  const mine = (history?.swaps ?? []).filter((swap) => swap.trader === wallet);
  const basis = basisFromSwaps(mine);

  if (balance <= 0 && basis.realised === 0) return { position: null, partial: false };

  const price = snapshot.price * rate;
  const value = balance * price;

  // Only claim a cost when this wallet's buys are actually in the history.
  const averageCost =
    basis.seen && basis.quantity > 0 ? (basis.cost / basis.quantity) * rate : null;
  const unrealisedPnl = averageCost === null ? null : value - balance * averageCost;
  const unrealisedPnlPct =
    averageCost === null || averageCost <= 0 || balance <= 0
      ? null
      : (price - averageCost) / averageCost;

  return {
    position: {
      baseMint: row.baseMint,
      poolAddress: row.poolAddress,
      name: row.name,
      symbol: row.symbol,
      mediaUrl: row.mediaUrl,
      mediaMime: row.mediaMime,
      curvePreset: row.curvePreset,
      balance,
      price,
      value,
      averageCost,
      unrealisedPnl,
      unrealisedPnlPct,
      realisedPnl: basis.realised * rate,
      currency,
      graduated: snapshot.curve.graduated,
      trades: [...mine]
        .sort((a, b) => a.slot - b.slot)
        .map((swap) => ({
          t: swap.timestamp,
          side: swap.side,
          base: swap.baseAmount,
          price: swap.price * rate,
        })),
    },
    partial: history?.partial ?? false,
  };
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Everything this wallet holds across Juno pools.
 *
 * Pools are walked a few at a time. Each position costs a token-account read, a
 * pool snapshot and possibly a swap history, and firing all of them at once is
 * the burst the public endpoint answers with 429s.
 */
export async function loadPortfolio(
  wallet: string,
  options: { poolLimit?: number; width?: number } = {},
): Promise<Portfolio> {
  // Validate before any RPC work: a malformed address cannot own anything, and
  // `new PublicKey` throws rather than returning null.
  try {
    new PublicKey(wallet);
  } catch {
    throw new CallerError("Not a Solana address");
  }

  const rows = await listPools(options.poolLimit ?? 40);
  const positions: Position[] = [];
  let partial = false;
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const result = await positionFor(wallet, row).catch(() => ({
        position: null,
        partial: true,
      }));
      if (result.position) positions.push(result.position);
      if (result.partial) partial = true;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.width ?? 3, rows.length) }, worker),
  );

  positions.sort((a, b) => b.value - a.value);

  const totalValue = positions.reduce((sum, p) => sum + p.value, 0);
  // A total is only meaningful when every part of it is in the same unit.
  const currencies = new Set(positions.map((p) => p.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : "mixed";

  const anyUnknownCost = positions.some((p) => p.balance > 0 && p.unrealisedPnl === null);
  const totalPnl = anyUnknownCost
    ? null
    : positions.reduce((sum, p) => sum + (p.unrealisedPnl ?? 0) + p.realisedPnl, 0);

  const totalCost = positions.reduce(
    (sum, p) => sum + (p.averageCost === null ? 0 : p.averageCost * p.balance),
    0,
  );

  return {
    wallet,
    positions,
    history: valueOverTime(positions, totalValue),
    totalValue,
    totalPnl,
    totalPnlPct: totalPnl === null || totalCost <= 0 ? null : totalPnl / totalCost,
    currency,
    partial,
  };
}


/**
 * Rebuild what the wallet was worth at each moment it traded.
 *
 * Walks every position's trades in one merged, time-ordered pass, carrying a
 * running balance and last-seen price per position. At each event the total is
 * the sum of `balance × lastPrice` across everything held — which is the only
 * honest reconstruction available, because no price was observed between
 * trades and inventing one would draw a line through numbers nobody paid.
 *
 * The final point is the live total, so the chart ends where the headline says
 * it does.
 */
export function valueOverTime(
  positions: Position[],
  liveTotal: number,
): Array<{ t: string; value: number }> {
  type Event = { at: number; mint: string; side: "buy" | "sell"; base: number; price: number };

  const events: Event[] = [];
  for (const position of positions) {
    for (const trade of position.trades) {
      const at = Date.parse(trade.t);
      if (Number.isFinite(at)) {
        events.push({ at, mint: position.baseMint, side: trade.side, base: trade.base, price: trade.price });
      }
    }
  }
  if (events.length === 0) return [];

  events.sort((a, b) => a.at - b.at);

  const balance = new Map<string, number>();
  const price = new Map<string, number>();
  const series: Array<{ t: string; value: number }> = [];

  for (const event of events) {
    const held = balance.get(event.mint) ?? 0;
    balance.set(event.mint, event.side === "buy" ? held + event.base : Math.max(0, held - event.base));
    price.set(event.mint, event.price);

    let total = 0;
    for (const [mint, amount] of balance) total += amount * (price.get(mint) ?? 0);
    series.push({ t: new Date(event.at).toISOString(), value: total });
  }

  // End on the live figure rather than on the last trade's mark.
  series.push({ t: new Date().toISOString(), value: liveTotal });
  return series;
}
