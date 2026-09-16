import { describe, it, expect } from "vitest";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  USDC_CONFIG,
  USDC_DECIMALS,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";
import { USDC_ASSET_ID, STABLECOIN_DECIMALS } from "@/lib/constants";
import { x402Network, x402Price, x402UsdcAsaId, x402PaymentAsset, facilitatorUrl } from "@/lib/x402";

/**
 * The app declares USDC's asset ids in lib/constants.ts (client-shared, so it
 * must not import @x402/avm and drag algosdk into the browser bundle) while the
 * x402 SDK carries its own copy. Two sources of truth for "which token is money"
 * is exactly the kind of thing that silently prices content in the wrong asset,
 * so pin them together here.
 */
describe("x402: our constants agree with the SDK", () => {
  it("uses the same USDC asset ids the x402 AVM scheme prices in", () => {
    expect(String(USDC_ASSET_ID.mainnet)).toBe(USDC_MAINNET_ASA_ID);
    expect(String(USDC_ASSET_ID.testnet)).toBe(USDC_TESTNET_ASA_ID);
  });

  it("agrees with the SDK on decimals", () => {
    expect(STABLECOIN_DECIMALS).toBe(USDC_DECIMALS);
  });

  it("maps each network to the SDK's USDC config", () => {
    expect(USDC_CONFIG[ALGORAND_MAINNET_CAIP2].asaId).toBe(String(USDC_ASSET_ID.mainnet));
    expect(USDC_CONFIG[ALGORAND_TESTNET_CAIP2].asaId).toBe(String(USDC_ASSET_ID.testnet));
  });
});

describe("x402: network + asset resolution", () => {
  it("defaults to Algorand TestNet's CAIP-2 id", () => {
    expect(x402Network()).toBe(ALGORAND_TESTNET_CAIP2);
    expect(x402UsdcAsaId()).toBe(USDC_TESTNET_ASA_ID);
  });

  it("follows the network switch to MainNet", () => {
    const prev = process.env.NEXT_PUBLIC_ALGO_NETWORK;
    try {
      process.env.NEXT_PUBLIC_ALGO_NETWORK = "mainnet";
      expect(x402Network()).toBe(ALGORAND_MAINNET_CAIP2);
      expect(x402UsdcAsaId()).toBe(USDC_MAINNET_ASA_ID);
    } finally {
      if (prev) process.env.NEXT_PUBLIC_ALGO_NETWORK = prev;
      else delete process.env.NEXT_PUBLIC_ALGO_NETWORK;
    }
  });

  it("defaults to an Algorand-capable facilitator", () => {
    // x402.org's public facilitator is EVM-only; pointing at it would 402 forever.
    expect(facilitatorUrl()).toContain("goplausible");
  });
});

describe("x402: pricing", () => {
  it("quotes dollar notation so the SDK resolves USDC per network", () => {
    expect(x402Price("3.00")).toBe("$3.00");
    expect(x402Price("1.5")).toBe("$1.50");
    expect(x402Price("0.25000000")).toBe("$0.25");
  });

  it("pins the asset explicitly under a sandbox override", () => {
    // The SDK's USDC_CONFIG can't be redirected, so an override has to be
    // expressed as an exact AssetAmount or the 402 would advertise real USDC
    // while the app settled something else.
    const prev = process.env.USDC_ASSET_ID_OVERRIDE;
    try {
      process.env.USDC_ASSET_ID_OVERRIDE = "766376238";
      expect(x402Price("2.00")).toEqual({ asset: "766376238", amount: "2000000" });
      expect(x402Price("0.01")).toEqual({ asset: "766376238", amount: "10000" });
      // Discovery must advertise the same asset the 402 charges in.
      expect(x402PaymentAsset().id).toBe("766376238");
    } finally {
      if (prev) process.env.USDC_ASSET_ID_OVERRIDE = prev;
      else delete process.env.USDC_ASSET_ID_OVERRIDE;
    }
  });

  it("converts to atomic units without float drift", () => {
    const prev = process.env.USDC_ASSET_ID_OVERRIDE;
    try {
      process.env.USDC_ASSET_ID_OVERRIDE = "1";
      // 0.07 * 1e6 in float is 70000.00000000001 — must not leak into an amount.
      expect(x402Price("0.07")).toEqual({ asset: "1", amount: "70000" });
      expect(x402Price("1.10")).toEqual({ asset: "1", amount: "1100000" });
    } finally {
      if (prev) process.env.USDC_ASSET_ID_OVERRIDE = prev;
      else delete process.env.USDC_ASSET_ID_OVERRIDE;
    }
  });

  it("advertises real USDC when no override is set", () => {
    const asset = x402PaymentAsset();
    expect(asset.id).toBe(USDC_TESTNET_ASA_ID);
    expect(asset.symbol).toBe("USDC");
    expect(asset.decimals).toBe(6);
  });
});
