import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import {
  addressOf,
  getAlgod,
  getAlgoBalance,
  getAssetBalance,
  getDeployerSigner,
  getPaymentAssetId,
  getPlatformAddress,
  isOptedIn,
  ASSET_DECIMALS,
} from "@/lib/algorand";
import { USDC_ASSET_ID, algoNetwork } from "@/lib/constants";

/**
 * Live reads against Algorand (public, read-only — no funds move).
 *
 * The payment asset is real USDC now, so there's nothing to deploy and no
 * NORR_ASA_ID gate: these run anywhere with network access.
 */
const hasDeployer = !!process.env.DEPLOYER_MNEMONIC;

describe("algorand: reads against the live network", () => {
  it("reads a fresh account as 0 / not-opted-in (never throws)", async () => {
    const fresh = algosdk.generateAccount().addr.toString();
    await expect(getAlgoBalance(fresh)).resolves.toBe(BigInt(0));
    await expect(getAssetBalance(fresh, getPaymentAssetId())).resolves.toBe(BigInt(0));
    await expect(isOptedIn(fresh, getPaymentAssetId())).resolves.toBe(false);
  });

  it("resolves the payment asset from the network", () => {
    expect(ASSET_DECIMALS).toBe(6);
    expect(getPaymentAssetId()).toBe(USDC_ASSET_ID[algoNetwork()]);
  });

  it("the asset id we ship really IS USDC on-chain, with 6 decimals", async () => {
    // The single highest-consequence constant in the app: if this id is wrong,
    // users deposit real money into the wrong token. Verify against the chain
    // itself rather than trusting the literal.
    const asset = await getAlgod().getAssetByID(getPaymentAssetId()).do();
    expect(asset.params?.unitName).toBe("USDC");
    expect(Number(asset.params?.decimals)).toBe(ASSET_DECIMALS);
  }, 30_000);
});

describe.skipIf(!hasDeployer)("algorand: the platform account", () => {
  it("derives a valid address from the deployer mnemonic", () => {
    const address = getPlatformAddress();
    expect(algosdk.isValidAddress(address)).toBe(true);
    expect(address).toHaveLength(58);
    // addressOf(sk) must agree with the platform address
    expect(addressOf(getDeployerSigner().sk)).toBe(address);
  });

  it("holds ALGO — it pays gas and seeds user wallets so they can opt in", async () => {
    expect(await getAlgoBalance(getPlatformAddress())).toBeGreaterThan(BigInt(0));
  });

  it("is opted in to USDC so it can receive unlock revenue", async () => {
    // Unlike a self-minted ASA (creator = implicitly opted in), USDC is Circle's
    // asset, so the platform must opt in like anyone else: `npm run wallet:setup`.
    expect(await isOptedIn(getPlatformAddress(), getPaymentAssetId())).toBe(true);
  }, 30_000);
});

describe("algorand: config validation", () => {
  it("defaults to TestNet — real money is never the fallback", () => {
    const prev = process.env.NEXT_PUBLIC_ALGO_NETWORK;
    try {
      delete process.env.NEXT_PUBLIC_ALGO_NETWORK;
      expect(algoNetwork()).toBe("testnet");
      expect(getPaymentAssetId()).toBe(USDC_ASSET_ID.testnet);
    } finally {
      if (prev) process.env.NEXT_PUBLIC_ALGO_NETWORK = prev;
    }
  });

  it("selects real MainNet USDC only when explicitly asked", () => {
    const prev = process.env.NEXT_PUBLIC_ALGO_NETWORK;
    try {
      process.env.NEXT_PUBLIC_ALGO_NETWORK = "mainnet";
      expect(getPaymentAssetId()).toBe(31566704);
    } finally {
      if (prev) process.env.NEXT_PUBLIC_ALGO_NETWORK = prev;
      else delete process.env.NEXT_PUBLIC_ALGO_NETWORK;
    }
  });

  it("rejects a malformed asset override rather than guessing", () => {
    const prev = process.env.USDC_ASSET_ID_OVERRIDE;
    try {
      process.env.USDC_ASSET_ID_OVERRIDE = "not-a-number";
      expect(() => getPaymentAssetId()).toThrow(/invalid/i);
      process.env.USDC_ASSET_ID_OVERRIDE = "-5";
      expect(() => getPaymentAssetId()).toThrow(/invalid/i);
      // Empty = unset, falls back to the network's canonical USDC.
      process.env.USDC_ASSET_ID_OVERRIDE = "";
      expect(getPaymentAssetId()).toBe(USDC_ASSET_ID[algoNetwork()]);
    } finally {
      if (prev) process.env.USDC_ASSET_ID_OVERRIDE = prev;
      else delete process.env.USDC_ASSET_ID_OVERRIDE;
    }
  });

  it("rejects a missing DEPLOYER_MNEMONIC", () => {
    const prev = process.env.DEPLOYER_MNEMONIC;
    try {
      delete process.env.DEPLOYER_MNEMONIC;
      expect(() => getDeployerSigner()).toThrow(/not set/i);
    } finally {
      if (prev) process.env.DEPLOYER_MNEMONIC = prev;
    }
  });
});
