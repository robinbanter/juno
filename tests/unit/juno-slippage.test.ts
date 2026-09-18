import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { DEFAULT_SLIPPAGE_BPS, buildPartialFillSwapTransaction, type PoolSnapshot } from "@/lib/juno/dbc";

/**
 * The partial-fill builder is the one path where a zero minimum used to be the
 * default. The DBC program fills a zero-minimum swap at any price, so the
 * builder must refuse one unless the caller opts out by name. The guard runs
 * before any RPC, so this needs no network.
 */
const snapshot = {
  poolAddress: new PublicKey("FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK"),
  baseDecimals: 6,
  quoteDecimals: 9,
} as unknown as PoolSnapshot;
const owner = new PublicKey("9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE");

describe("partial-fill slippage guard", () => {
  it("refuses a zero minimum without the explicit opt-out", async () => {
    await expect(
      buildPartialFillSwapTransaction({ snapshot, owner, side: "buy", amountIn: 1, minimumAmountOut: 0 }),
    ).rejects.toThrow(/no minimum output/);
  });

  it("refuses a missing minimum", async () => {
    // The type makes it required; this is the runtime backstop for a caller
    // that omits it anyway (plain JS, or a cast), which used to mean zero.
    const params = { snapshot, owner, side: "buy", amountIn: 1 } as unknown as Parameters<
      typeof buildPartialFillSwapTransaction
    >[0];
    await expect(buildPartialFillSwapTransaction(params)).rejects.toThrow(/no minimum output/);
  });

  it("refuses a negative or NaN minimum too", async () => {
    for (const bad of [-1, Number.NaN]) {
      await expect(
        buildPartialFillSwapTransaction({ snapshot, owner, side: "buy", amountIn: 1, minimumAmountOut: bad }),
      ).rejects.toThrow(/no minimum output/);
    }
  });

  it("uses the UI's tolerance as the shared default", () => {
    expect(DEFAULT_SLIPPAGE_BPS).toBe(100);
  });
});
