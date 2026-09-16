import { describe, expect, it } from "vitest";
import {
  TokenDecimal,
  buildCurveWithLiquidityWeights,
  validateConfigParameters,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PublicKey } from "@solana/web3.js";

import {
  CURVE_PRESETS,
  CURVE_PRESET_LIST,
  CURVE_SEGMENTS,
  buildPresetParams,
} from "@/lib/juno/curves";
import type { CurvePresetId } from "@/lib/juno/types";

/**
 * These presets are the substance of Juno's DBC use, so they are tested
 * against the SDK's own validator rather than eyeballed. If Meteora tightens a
 * constraint, this fails here instead of on mainnet.
 */
const USDC_QUOTE = {
  initialMarketCap: 1_000,
  migrationMarketCap: 25_000,
  quoteDecimals: TokenDecimal.SIX,
} as const;

/**
 * `validateConfigParameters` wants the config *plus* the one account field it
 * does not omit. It must be a real key: the validator rejects
 * `PublicKey.default` outright, since a leftover receiver of all-zeroes would
 * burn the remaining supply.
 */
const LEFTOVER_RECEIVER = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

describe("curve presets", () => {
  it.each(CURVE_PRESET_LIST.map((p) => p.id))(
    "%s builds a config the DBC program accepts",
    (id) => {
      const params = buildPresetParams({ preset: id, ...USDC_QUOTE });
      const config = buildCurveWithLiquidityWeights(params);

      expect(() =>
        validateConfigParameters({ ...config, leftoverReceiver: LEFTOVER_RECEIVER }),
      ).not.toThrow();
    },
  );

  it.each(CURVE_PRESET_LIST.map((p) => p.id))(
    "%s produces a monotonically rising curve within the segment limit",
    (id) => {
      const config = buildCurveWithLiquidityWeights(
        buildPresetParams({ preset: id, ...USDC_QUOTE }),
      );

      expect(config.curve.length).toBeGreaterThan(0);
      expect(config.curve.length).toBeLessThanOrEqual(CURVE_SEGMENTS);

      // Curve points must strictly ascend in price, or the program rejects it.
      for (let i = 1; i < config.curve.length; i++) {
        const prev = config.curve[i - 1].sqrtPrice;
        const curr = config.curve[i].sqrtPrice;
        expect(curr.gt(prev)).toBe(true);
      }
    },
  );

  it("uses all sixteen segments so the weights actually shape the curve", () => {
    for (const preset of CURVE_PRESET_LIST) {
      expect(preset.weights).toHaveLength(CURVE_SEGMENTS);
      expect(preset.weights.every((w) => w > 0)).toBe(true);
    }
  });

  it("decays fees from an anti-snipe opening to an equity-like spread", () => {
    for (const preset of CURVE_PRESET_LIST) {
      expect(preset.startingFeeBps).toBeGreaterThan(preset.endingFeeBps);
      // MIN_FEE_BPS / MAX_FEE_BPS from the SDK.
      expect(preset.endingFeeBps).toBeGreaterThanOrEqual(25);
      expect(preset.startingFeeBps).toBeLessThanOrEqual(9900);
    }
  });

  it("shapes each preset the way its description claims", () => {
    const first = (id: CurvePresetId) => CURVE_PRESETS[id].weights[0];
    const last = (id: CurvePresetId) =>
      CURVE_PRESETS[id].weights[CURVE_SEGMENTS - 1];
    const mid = (id: CurvePresetId) => CURVE_PRESETS[id].weights[CURVE_SEGMENTS / 2];

    // Content back-loads liquidity: cheap early, steep late.
    expect(last("content")).toBeGreaterThan(first("content"));

    // A thin name front-loads it, for depth at the issue price.
    expect(first("thin-name")).toBeGreaterThan(last("thin-name"));

    // An IPO book is deep at both ends and thin through discovery.
    expect(first("ipo-book")).toBeGreaterThan(mid("ipo-book"));
    expect(last("ipo-book")).toBeGreaterThan(mid("ipo-book"));

    // Tight NAV is flat: uniform liquidity everywhere.
    expect(new Set(CURVE_PRESETS["tight-nav"].weights).size).toBe(1);
  });

  it("never migrates to the deprecated DAMM v1 path", () => {
    for (const preset of CURVE_PRESET_LIST) {
      const config = buildCurveWithLiquidityWeights(
        buildPresetParams({ preset: preset.id, ...USDC_QUOTE }),
      );
      // MigrationOption.MET_DAMM_V2 === 1
      expect(config.migrationOption).toBe(1);
    }
  });

  it("never uses the deprecated RateLimiter fee mode", () => {
    for (const preset of CURVE_PRESET_LIST) {
      const params = buildPresetParams({ preset: preset.id, ...USDC_QUOTE });
      expect(params.fee.baseFeeParams.baseFeeMode).not.toBe(2);
    }
  });
});
