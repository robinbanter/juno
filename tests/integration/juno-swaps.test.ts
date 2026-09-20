import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { getDbcClient } from "@/lib/juno/dbc";
import {
  invalidateSwapHistory,
  listSwapHistory,
  priceSeries,
  totalVolume,
  type PoolVaults,
  type SwapHistory,
} from "@/lib/juno/swaps";

/**
 * Live reads against Solana devnet. Nothing is signed and nothing moves.
 *
 * These check the decoder against pools this project really launched and really
 * traded — history the program wrote, not a fixture that could drift from it.
 * The rules themselves are pinned in `tests/unit/juno-swaps.test.ts`, which is
 * where a case like "a migration is not a trade" can be stated exactly.
 *
 * Juno runs on the public devnet endpoint by choice, and that endpoint refuses
 * batched transaction reads under load. So a read here can legitimately come
 * back short, and `SwapHistory.partial` says when it did. Asserting a count
 * against a throttled endpoint would make a test that fails for reasons that
 * have nothing to do with the code, so counts are only asserted on a complete
 * read; everything that must always hold is asserted on whatever came back.
 */

/** Launched by `juno:launch`, then bought *and sold* against via `juno:trade`. */
const TRADED_POOL = "FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK";
/** Driven 0% -> 100% across 8 buys, then migrated to DAMM v2. */
const GRADUATED_POOL = "F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ";

async function vaultsFor(poolAddress: string): Promise<PoolVaults> {
  const pool = (await getDbcClient().state.getPool(new PublicKey(poolAddress))) as unknown as {
    poolState: { baseVault: PublicKey; quoteVault: PublicKey; config: PublicKey };
  } | null;
  if (!pool) throw new Error(`pool ${poolAddress} not found on this cluster`);

  const state = pool.poolState;
  const config = (await getDbcClient().state.getPoolConfig(state.config)) as unknown as {
    tokenDecimal: number;
  };
  return {
    baseVault: state.baseVault.toBase58(),
    quoteVault: state.quoteVault.toBase58(),
    baseDecimals: Number(config.tokenDecimal),
    // Both demo pools are SOL-quoted.
    quoteDecimals: 9,
  };
}

/**
 * Read a pool's history, trying again while the endpoint is refusing pages.
 *
 * Returns the best attempt — a complete read if one arrives, otherwise the
 * fullest partial one, so the caller can still assert what is universally true.
 */
async function readHistory(pool: string, attempts = 3): Promise<SwapHistory> {
  const vaults = await vaultsFor(pool);
  let best: SwapHistory = { swaps: [], partial: true };

  for (let i = 0; i < attempts; i += 1) {
    invalidateSwapHistory(pool);
    const history = await listSwapHistory(pool, vaults, 40);
    if (!history.partial) return history;
    if (history.swaps.length > best.swaps.length) best = history;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return best;
}

/** Everything that must hold for a decoded swap, regardless of how many arrived. */
function expectWellFormed(history: SwapHistory) {
  for (const swap of history.swaps) {
    expect(swap.baseAmount).toBeGreaterThan(0);
    expect(swap.quoteAmount).toBeGreaterThan(0);
    // Price is derived, so it must agree with its own inputs.
    expect(swap.price).toBeCloseTo(swap.quoteAmount / swap.baseAmount, 12);
    expect(["buy", "sell"]).toContain(swap.side);
    expect(swap.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(() => new PublicKey(swap.trader)).not.toThrow();
    expect(Number.isFinite(Date.parse(swap.timestamp))).toBe(true);
    expect(swap.slot).toBeGreaterThan(0);
  }

  // Newest first.
  for (let i = 1; i < history.swaps.length; i += 1) {
    expect(history.swaps[i - 1].slot).toBeGreaterThanOrEqual(history.swaps[i].slot);
  }
}

describe("juno swaps: decoded from real pool vault deltas", () => {
  it("decodes this project's own trade history", async () => {
    const history = await readHistory(TRADED_POOL);
    expectWellFormed(history);

    // A partial read can return nothing at all; a complete one cannot, because
    // this pool has traded.
    if (!history.partial) {
      expect(history.swaps.length).toBeGreaterThan(0);

      // The pool was traded in both directions. A decoder that reported one
      // side for everything — exactly what the previous implementation did —
      // would satisfy a length check and fail this.
      const sides = new Set(history.swaps.map((swap) => swap.side));
      expect(sides.has("buy")).toBe(true);
      expect(sides.has("sell")).toBe(true);
    }
  }, 120_000);

  it("reads a migrated pool's history without counting the migration as a trade", async () => {
    // This pool's signatures include a launch, eight buys and a migration. Only
    // the buys move both vaults in opposite directions.
    const history = await readHistory(GRADUATED_POOL);
    expectWellFormed(history);

    if (!history.partial) {
      expect(history.swaps.length).toBeGreaterThan(0);
      expect(history.swaps.every((swap) => swap.side === "buy")).toBe(true);
    }
  }, 120_000);

  it("derives volume and a price series that agree with the decoded swaps", async () => {
    const history = await readHistory(TRADED_POOL);
    if (history.swaps.length === 0) {
      // Nothing came back. There is no claim to check, and inventing one would
      // defeat the point of the test.
      expect(history.partial).toBe(true);
      return;
    }

    const total = totalVolume(history.swaps);
    expect(total).not.toBeNull();
    expect(total!).toBeCloseTo(
      history.swaps.reduce((sum, swap) => sum + swap.quoteAmount, 0),
      12,
    );

    const series = priceSeries(history.swaps);
    expect(series).toHaveLength(history.swaps.length);
    for (let i = 1; i < series.length; i += 1) {
      expect(Date.parse(series[i - 1].t)).toBeLessThanOrEqual(Date.parse(series[i].t));
    }
    for (const point of series) {
      expect(point.price).toBeGreaterThan(0);
    }
  }, 120_000);

  it("reports an address with no pool as empty rather than throwing", async () => {
    const vaults: PoolVaults = {
      baseVault: "11111111111111111111111111111111",
      quoteVault: "11111111111111111111111111111112",
      baseDecimals: 6,
      quoteDecimals: 9,
    };
    // WSOL's mint is a real account with no swap history against these vaults.
    const history = await listSwapHistory(
      "So11111111111111111111111111111111111111112",
      vaults,
      5,
    );
    expect(history.swaps).toEqual([]);
  }, 120_000);
});
