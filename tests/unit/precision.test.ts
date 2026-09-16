import { describe, it, expect } from "vitest";
import { usdToUnits, usdToChainUnits, unitsToUsd } from "@/lib/spend-reservation";

/**
 * The ledger stores 8dp; USDC has 6. The transfer rounds UP (you cannot send a
 * fraction of a base unit), so if the authorisation truncated, it would reserve
 * LESS than the transfer spends — measured: "1.50000001" escrowed 1500000 while
 * the chain took 1500001, and "0.00000001" escrowed NOTHING while still spending
 * a unit, making the reservation invisible to the next caller's check.
 */
describe("ledger ↔ chain precision", () => {
  it("authorises what the chain will actually take, never less", () => {
    for (const amount of ["1.50", "1.50000001", "0.00000001", "2.99999999", "4.00", "0"]) {
      expect(
        usdToChainUnits(amount),
        `${amount}: escrow must cover the transfer`,
      ).toBeGreaterThanOrEqual(usdToUnits(amount));
    }
  });

  it("rounds up exactly like the transfer does", () => {
    expect(usdToChainUnits("1.50000001")).toBe(1_500_001n);
    expect(usdToChainUnits("0.00000001")).toBe(1n);
    expect(usdToChainUnits("2.99999999")).toBe(3_000_000n);
  });

  it("is exact — not merely bigger — for representable amounts", () => {
    // The normal case: a 2dp price must reserve precisely its own value, or
    // every unlock would over-reserve and shrink the fan's spendable balance.
    for (const [amount, units] of [["1.50", 1_500_000n], ["4.00", 4_000_000n], ["0.01", 10_000n]] as const) {
      expect(usdToChainUnits(amount)).toBe(units);
      expect(usdToChainUnits(amount)).toBe(usdToUnits(amount));
    }
  });

  it("keeps zero at zero — a free post must still authorise", () => {
    expect(usdToChainUnits("0")).toBe(0n);
    expect(usdToChainUnits("0.00000000")).toBe(0n);
  });

  it("round-trips a reserved amount back to a storable string", () => {
    expect(unitsToUsd(usdToChainUnits("1.50000001"))).toBe("1.50000100");
  });
});
