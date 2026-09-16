import { describe, it, expect } from "vitest";
import { usdToUnits, unitsToUsd, usdToChainUnits, escrowedFor } from "@/lib/spend-reservation";

/**
 * The unit conversion behind every spend authorisation.
 *
 * `checkAndEscrow` itself needs a live DB (it takes a row lock — that IS the
 * behaviour), so it's covered end to end. What's pinned here is the arithmetic
 * it decides with: a rounding slip means authorising the wrong amount.
 */
describe("spend reservation units", () => {
  it("converts USD to 6dp atomic units exactly", () => {
    expect(usdToUnits("1.00")).toBe(1_000_000n);
    expect(usdToUnits("0.000001")).toBe(1n);
    expect(usdToUnits("0")).toBe(0n);
    expect(usdToUnits("123.456789")).toBe(123_456_789n);
  });

  it("does not drift on values that float would mangle", () => {
    // 0.07 * 1e6 in float is 70000.00000000001.
    expect(usdToUnits("0.07")).toBe(70_000n);
    expect(usdToUnits("1.10")).toBe(1_100_000n);
    expect(usdToUnits("4.35")).toBe(4_350_000n);
  });

  it("tolerates the 8dp strings the ledger stores", () => {
    // Balances come back as "2.00000000" — extra precision must truncate, not throw.
    expect(usdToUnits("2.00000000")).toBe(2_000_000n);
    expect(usdToUnits("0.12345678")).toBe(123_456n);
  });

  it("round-trips", () => {
    for (const v of ["0.000000", "1.500000", "99.990000"]) {
      expect(unitsToUsd(usdToUnits(v))).toBe(`${v}00`);
    }
  });

  it("treats a missing or blank value as zero rather than NaN", () => {
    expect(usdToUnits("")).toBe(0n);
    expect(usdToUnits("   ")).toBe(0n);
  });
});

/**
 * Reserve and release must agree to the last atomic unit.
 *
 * `checkAndEscrow` stores the CEILED amount, because that is what the chain
 * removes. If a release subtracts the raw amount instead, the difference is
 * stranded in escrow permanently — reserving 1.50000001 stores 1.50000100, so
 * releasing 1.50000001 leaves 0.00000099 behind, on every spend, forever.
 *
 * `normalizeMoney` allows 8dp and a withdrawal amount comes straight from the
 * user, so this is reachable rather than theoretical. A slow leak that locks
 * away the user's own money is worse than the rounding that caused it.
 */
describe("escrow reserve/release symmetry", () => {
  it("releases exactly what was reserved", () => {
    for (const v of ["1.50000001", "0.00000001", "4.35", "2.00000000", "0.07"]) {
      expect(escrowedFor(v)).toBe(unitsToUsd(usdToChainUnits(v)));
    }
  });

  it("rounds UP to what the chain will actually take", () => {
    // The transfer cannot send a fraction of a base unit, so it rounds up.
    // Reserving less than it spends is how escrow silently under-counts.
    expect(usdToChainUnits("1.50000001")).toBe(1_500_001n);
    expect(usdToChainUnits("0.00000001")).toBe(1n); // never 0 — that reserved nothing
    expect(usdToChainUnits("2.00000000")).toBe(2_000_000n); // exact stays exact
  });

  it("stores a figure that survives a round trip through the ledger", () => {
    // The stored string is read back and re-parsed on the next check. If it
    // rounded back down, part of the reservation would go invisible.
    for (const v of ["1.50000001", "0.00000001", "4.35"]) {
      const stored = escrowedFor(v);
      expect(usdToUnits(stored)).toBe(usdToChainUnits(v));
    }
  });
});
