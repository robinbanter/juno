import { afterEach, describe, expect, it } from "vitest";
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  deriveDammV2PoolAuthority,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

import {
  cluster,
  clusterFrom,
  explorer,
  isFork,
  isMainnet,
  meteoraPoolUrl,
  rpcEndpoint,
  usesMainnetAddresses,
  usingPublicRpc,
} from "@/lib/juno/cluster";
import { CURVE_PRESET_LIST } from "@/lib/juno/curves";
import { MAINNET_USDC, forkCloneList, testValidatorArgs } from "@/lib/juno/fork";
import { PYTH_FEEDS } from "@/lib/juno/pyth";
import { pythSource } from "@/lib/juno/pyth-source";

const ENV = { ...process.env };
function withCluster(value: string | undefined, rpc?: string) {
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER = value;
  if (rpc === undefined) delete process.env.NEXT_PUBLIC_SOLANA_RPC;
  else process.env.NEXT_PUBLIC_SOLANA_RPC = rpc;
}
afterEach(() => {
  process.env = { ...ENV };
});

describe("cluster", () => {
  it("keeps addresses and endpoint apart on a mainnet fork", () => {
    withCluster("mainnet-fork");
    expect(cluster()).toBe("mainnet-fork");
    expect(isFork()).toBe(true);
    // Mainnet addresses, but not the real mainnet — airdrops are allowed.
    expect(usesMainnetAddresses()).toBe(true);
    expect(isMainnet()).toBe(false);
    expect(rpcEndpoint()).toBe("http://127.0.0.1:8899");
    expect(usingPublicRpc()).toBe(false);
  });

  it("points fork links at an explorer that can read a custom RPC", () => {
    withCluster("mainnet-fork", "http://127.0.0.1:8917");
    expect(explorer.tx("sig")).toBe(
      "https://explorer.solana.com/tx/sig?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8917",
    );
    expect(meteoraPoolUrl("pool")).toContain("explorer.solana.com/address/pool");
  });

  it("leaves devnet and mainnet as they were", () => {
    withCluster(undefined);
    expect(cluster()).toBe("devnet");
    expect(usesMainnetAddresses()).toBe(false);
    expect(explorer.tx("sig")).toBe("https://solscan.io/tx/sig?cluster=devnet");

    withCluster("mainnet-beta");
    expect(isMainnet()).toBe(true);
    expect(usesMainnetAddresses()).toBe(true);
    expect(explorer.account("a")).toBe("https://solscan.io/account/a");
    expect(meteoraPoolUrl("p")).toBe("https://app.meteora.ag/dbc/p");
  });

  it("has one selector: the Pyth source agrees with the app on a fork", () => {
    const env = { NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-fork" };
    expect(clusterFrom(env)).toBe("mainnet-fork");
    // The Pyth source reads the cluster through clusterFrom too.
    expect(pythSource(env)).toMatchObject({
      network: "mainnet-beta",
      rpc: "https://api.mainnet-beta.solana.com",
    });
    expect(pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "devnet" })).toMatchObject({ network: "devnet", rpc: null });
  });

  it("treats an unknown value as devnet, never as mainnet", () => {
    withCluster("mainnet");
    expect(cluster()).toBe("devnet");
  });
});

describe("forkCloneList", () => {
  const list = forkCloneList();
  const addresses = list.map((e) => e.address);

  it("clones the three programs the flow invokes", () => {
    expect(list.filter((e) => e.kind === "program").map((e) => e.address)).toEqual([
      "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
      "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    ]);
  });

  it("clones the funded DAMM v2 pool authority that pays migration rent", () => {
    expect(addresses).toContain(deriveDammV2PoolAuthority().toBase58());
  });

  it("clones exactly the DAMM v2 configs the presets graduate into", () => {
    const tiers = new Set(CURVE_PRESET_LIST.map((p) => Number(p.migrationFeeOption)));
    for (const tier of tiers) {
      expect(addresses).toContain(DAMM_V2_MIGRATION_FEE_ADDRESS[tier].toBase58());
    }
    expect(list.filter((e) => e.label.startsWith("DAMM v2 config"))).toHaveLength(tiers.size);
  });

  it("clones mainnet USDC and every Pyth feed on both shards", () => {
    expect(addresses).toContain(MAINNET_USDC);
    expect(list.filter((e) => e.label.startsWith("Pyth"))).toHaveLength(
      Object.keys(PYTH_FEEDS).length * 2,
    );
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  it("uses --clone-upgradeable-program for programs", () => {
    const args = testValidatorArgs(list);
    expect(args.slice(0, 4)).toEqual([
      "--url",
      "mainnet-beta",
      "--clone-upgradeable-program",
      "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
    ]);
    expect(args.filter((a) => a === "--clone")).toHaveLength(list.length - 3);
  });
});
