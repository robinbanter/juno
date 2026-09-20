import { describe, it, expect } from "vitest";

import { basisFromSwaps } from "@/lib/juno/portfolio";

/**
 * Average-cost accounting, which is the part of a portfolio that can lie.
 *
 * A balance is read from chain and is simply true. A *cost* is a policy
 * decision, and the policy chosen here — average cost — is the one that cannot
 * tell a holder the opposite of their real situation. These tests pin the
 * behaviour that choice implies, including the cases where the honest answer is
 * "unknown" rather than a number.
 */

type Swap = { side: "buy" | "sell"; baseAmount: number; quoteAmount: number; slot: number };

const buy = (base: number, quote: number, slot: number): Swap => ({
  side: "buy",
  baseAmount: base,
  quoteAmount: quote,
  slot,
});
const sell = (base: number, quote: number, slot: number): Swap => ({
  side: "sell",
  baseAmount: base,
  quoteAmount: quote,
  slot,
});

describe("basisFromSwaps", () => {
  it("averages the cost of several buys", () => {
    // 100 @ 1.0 then 100 @ 3.0 -> 200 held at an average of 2.0
    const basis = basisFromSwaps([buy(100, 100, 1), buy(100, 300, 2)]);
    expect(basis.quantity).toBe(200);
    expect(basis.cost).toBe(400);
    expect(basis.cost / basis.quantity).toBe(2);
    expect(basis.realised).toBe(0);
    expect(basis.seen).toBe(true);
  });

  it("orders by slot, not by array position", () => {
    // The RPC returns history newest-first; accounting has to run forwards.
    const forwards = basisFromSwaps([buy(100, 100, 1), sell(50, 100, 2)]);
    const backwards = basisFromSwaps([sell(50, 100, 2), buy(100, 100, 1)]);
    expect(backwards).toEqual(forwards);
  });

  it("realises profit against the average, leaving the average unchanged", () => {
    // 200 held at an average of 2.0; sell 100 for 500 (5.0 each) -> +300 realised.
    const basis = basisFromSwaps([buy(100, 100, 1), buy(100, 300, 2), sell(100, 500, 3)]);
    expect(basis.quantity).toBe(100);
    expect(basis.realised).toBeCloseTo(300, 9);
    // The remaining 100 still carry the same average, not a re-based one.
    expect(basis.cost / basis.quantity).toBeCloseTo(2, 9);
  });

  it("realises a loss as a negative number", () => {
    const basis = basisFromSwaps([buy(100, 400, 1), sell(50, 100, 2)]);
    // Average 4.0; sold 50 for 100 (2.0 each) -> -100.
    expect(basis.realised).toBeCloseTo(-100, 9);
    expect(basis.quantity).toBe(50);
    expect(basis.cost / basis.quantity).toBeCloseTo(4, 9);
  });

  it("does not let an early cheap lot manufacture a gain on a losing position", () => {
    // This is the reason average cost was chosen over FIFO. Bought 100 @ 1 then
    // 100 @ 9 (average 5, position deep underwater at a 2.0 market). Selling
    // 100 at 2.0 is a loss on the position, and FIFO would report +100 profit
    // by matching the sale against the first, cheapest lot.
    const basis = basisFromSwaps([buy(100, 100, 1), buy(100, 900, 2), sell(100, 200, 3)]);
    expect(basis.realised).toBeCloseTo(-300, 9);
    expect(basis.realised).toBeLessThan(0);
  });

  it("closes out to exactly zero rather than a floating-point residue", () => {
    // A residue would divide into an absurd average on the next read.
    const basis = basisFromSwaps([buy(0.1, 0.3, 1), buy(0.2, 0.6, 2), sell(0.3, 1.2, 3)]);
    expect(basis.quantity).toBe(0);
    expect(basis.cost).toBe(0);
    expect(basis.realised).toBeCloseTo(0.3, 9);
  });

  it("only matches the part of a sell that has a tracked cost", () => {
    // 50 bought here, 150 arrived some other way. Selling all 200 can only
    // realise against the 50 whose cost is actually known.
    const basis = basisFromSwaps([buy(50, 100, 1), sell(200, 800, 2)]);
    expect(basis.quantity).toBe(0);
    // 50 matched at an average of 2.0; proceeds for those 50 are 800 * 50/200 = 200.
    expect(basis.realised).toBeCloseTo(100, 9);
  });

  it("reports nothing seen for an empty history", () => {
    const basis = basisFromSwaps([]);
    expect(basis).toEqual({ quantity: 0, cost: 0, realised: 0, seen: false });
  });

  it("reports nothing seen when the wallet only ever sold", () => {
    // Tokens acquired outside the visible window. `seen` false is what makes
    // the caller report a null cost instead of implying the holding is free.
    const basis = basisFromSwaps([sell(100, 200, 1)]);
    expect(basis.seen).toBe(false);
    expect(basis.quantity).toBe(0);
    expect(basis.realised).toBe(0);
  });
});
