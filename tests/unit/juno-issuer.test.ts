import { describe, expect, it } from "vitest";
import {
  TokenDecimal,
  buildCurveWithLiquidityWeights,
  type PoolConfig,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

import { CURVE_PRESETS, CURVE_PRESET_LIST, buildPresetParams } from "@/lib/juno/curves";
import { feeSchedule } from "@/lib/juno/economics";
import { dammTarget, presetFromConfig } from "@/lib/juno/issuer";
import type { CurvePresetId } from "@/lib/juno/types";

/**
 * The pure halves of the issuer tooling. The chain-facing halves are proven
 * on devnet by `juno:claim --simulate` / `juno:graduate --simulate`.
 */
function configFor(preset: CurvePresetId): PoolConfig {
  return buildCurveWithLiquidityWeights(
    buildPresetParams({
      preset,
      initialMarketCap: 1_000,
      migrationMarketCap: 25_000,
      quoteDecimals: TokenDecimal.NINE,
    }),
  ) as unknown as PoolConfig;
}

describe("presetFromConfig", () => {
  it.each(CURVE_PRESET_LIST.map((p) => p.id))("recognises a %s config", (id) => {
    const config = configFor(id);
    const fee = feeSchedule({ config, activationPoint: 0, nowSeconds: 0 });
    expect(fee?.startBps).toBe(CURVE_PRESETS[id].startingFeeBps);
    expect(presetFromConfig(config, fee)?.id).toBe(id);
  });

  it("returns null for a config Juno did not write", () => {
    const config = configFor("content");
    const fee = feeSchedule({ config, activationPoint: 0, nowSeconds: 0 })!;
    expect(presetFromConfig(config, { ...fee, startBps: 1234 })).toBeNull();
  });

  it("reports the fee at its floor once the decay window has passed", () => {
    const config = configFor("content");
    const fee = feeSchedule({ config, activationPoint: 0, nowSeconds: 10_000 })!;
    expect(fee.secondsRemaining).toBe(0);
    expect(fee.currentBps).toBe(fee.endBps);
    expect(fee.endBps).toBeGreaterThanOrEqual(CURVE_PRESETS.content.endingFeeBps - 1);
    expect(fee.endBps).toBeLessThanOrEqual(CURVE_PRESETS.content.endingFeeBps + 1);
  });
});

describe("dammTarget", () => {
  it("derives the DAMM v2 pool a real devnet graduation created", () => {
    // GRAD: content preset (fee option 2), migrated on devnet in 4HatkGNZ…bMVTZtc.
    const target = dammTarget({
      migrationFeeOption: 2,
      baseMint: "HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9",
      quoteMint: "So11111111111111111111111111111111111111112",
    });
    expect(target?.pool.toBase58()).toBe("EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L");
  });

  it("follows the pool's fee tier, not a default preset", () => {
    const mints = {
      baseMint: "HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9",
      quoteMint: "So11111111111111111111111111111111111111112",
    };
    const content = dammTarget({ migrationFeeOption: 2, ...mints });
    const thin = dammTarget({ migrationFeeOption: 1, ...mints });
    expect(content?.config.equals(thin!.config)).toBe(false);
    expect(content?.pool.equals(thin!.pool)).toBe(false);
  });

  it("returns null for an unknown fee tier", () => {
    expect(
      dammTarget({
        migrationFeeOption: 99,
        baseMint: "HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9",
        quoteMint: "So11111111111111111111111111111111111111112",
      }),
    ).toBeNull();
  });
});
