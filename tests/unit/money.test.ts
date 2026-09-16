import { describe, it, expect } from "vitest";
import { normalizeMoney } from "@/lib/custodial/money";
import {
  formatUsd,
  algoTxUrl,
  algoAssetUrl,
  algoAddressUrl,
  algoConfig,
  algoNetwork,
  ALGORAND_NETWORKS,
  USDC_ASSET_ID,
  APP_NAME,
  STABLECOIN_DECIMALS,
  PLATFORM_CUT,
  CREATOR_CUT,
  POINTS_PER_UNLOCK,
} from "@/lib/constants";

describe("normalizeMoney", () => {
  it("normalizes to 8dp", () => {
    expect(normalizeMoney("25")).toBe("25.00000000");
    expect(normalizeMoney("3.5")).toBe("3.50000000");
    expect(normalizeMoney("0.00000001")).toBe("0.00000001");
    expect(normalizeMoney(2)).toBe("2.00000000");
  });

  it("rejects zero and negatives (a spend/deposit must be positive)", () => {
    expect(() => normalizeMoney("0")).toThrow(/invalid amount/i);
    expect(() => normalizeMoney("0.00")).toThrow(/invalid amount/i);
    expect(() => normalizeMoney("-5")).toThrow(/invalid amount/i);
  });

  it("rejects non-numeric / empty / nullish", () => {
    expect(() => normalizeMoney("abc")).toThrow(/invalid amount/i);
    expect(() => normalizeMoney("")).toThrow(/invalid amount/i);
    expect(() => normalizeMoney(null)).toThrow(/invalid amount/i);
    expect(() => normalizeMoney(undefined)).toThrow(/invalid amount/i);
    expect(() => normalizeMoney("1e3")).toThrow(/invalid amount/i);
    expect(() => normalizeMoney(" 5 ")).not.toThrow(); // trimmed
  });

  it("rejects more precision than the ledger holds", () => {
    expect(() => normalizeMoney("1.123456789")).toThrow(/invalid amount/i);
  });
});

describe("formatUsd", () => {
  it("always shows at least 2dp", () => {
    expect(formatUsd("3")).toBe("3.00");
    expect(formatUsd("3.5")).toBe("3.50");
    expect(formatUsd(0)).toBe("0.00");
  });

  it("trims trailing zeros beyond 2dp", () => {
    expect(formatUsd("3.5000")).toBe("3.50");
    expect(formatUsd("2.250")).toBe("2.25");
  });

  it("falls back to 0.00 for junk", () => {
    expect(formatUsd("abc")).toBe("0.00");
    expect(formatUsd(Number.NaN)).toBe("0.00");
  });
});

describe("explorer urls + constants", () => {
  it("builds Algorand explorer links for the active network", () => {
    const { explorer } = algoConfig();
    expect(algoTxUrl("TXID123")).toBe(`${explorer}/tx/TXID123`);
    expect(algoAssetUrl(USDC_ASSET_ID.testnet)).toBe(`${explorer}/asset/10458941`);
    expect(algoAddressUrl("ADDR")).toBe(`${explorer}/address/ADDR`);
  });

  it("defaults to TestNet — MainNet must be opted into explicitly", () => {
    // Guards against real money moving because an env var was merely absent.
    expect(algoNetwork()).toBe("testnet");
    expect(algoConfig().algod).toContain("testnet");
  });

  it("pins the real USDC asset ids", () => {
    // Circle's canonical assets. A typo here sends funds to the wrong token, so
    // these are asserted literally rather than derived.
    expect(USDC_ASSET_ID.mainnet).toBe(31566704);
    expect(USDC_ASSET_ID.testnet).toBe(10458941);
    expect(ALGORAND_NETWORKS.mainnet.algod).toContain("mainnet");
    expect(ALGORAND_NETWORKS.mainnet.dispenser).toBeNull(); // no free money on MainNet
  });

  it("keeps the business constants coherent", () => {
    expect(APP_NAME).toBe("Norr");
    expect(STABLECOIN_DECIMALS).toBe(6); // USDC's decimals, on both networks
    expect(PLATFORM_CUT + CREATOR_CUT).toBeCloseTo(1);
    expect(POINTS_PER_UNLOCK).toBeGreaterThan(0);
  });
});
