/**
 * What a local mainnet fork must clone for Juno's issuance flow to run.
 *
 * A fork validator starts with only the native programs (System, SPL Token,
 * Token-2022, Associated Token, Memo, …). Everything else a STOCKLANA
 * issuance touches — launch, trade, claim, migrate to DAMM v2, and the NAV
 * band — has to be copied in from mainnet. This derives that list from the
 * same constants the flow itself uses, so it cannot drift from the code.
 *
 * Pure: no RPC. `scripts/juno-fork.ts` checks each entry against mainnet and
 * prints validator flags.
 */

import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DAMM_V2_PROGRAM_ID,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  METAPLEX_PROGRAM_ID,
  deriveDammV2PoolAuthority,
  deriveDbcPoolAuthority,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

import { CURVE_PRESET_LIST } from "./curves";
import { PYTH_SHARDS, priceFeedAccount } from "./pyth-account";
import { PYTH_FEEDS } from "./pyth";

/** Mainnet Circle USDC — the quote mint for equity-shaped issuance. */
export const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type CloneKind = "program" | "account";

export type CloneEntry = {
  address: string;
  kind: CloneKind;
  label: string;
  /** Which step of the flow fails without it. */
  neededFor: string;
  /**
   * Some derived addresses legitimately do not exist on mainnet (a feed that
   * is not sponsored on a given shard). The flow tolerates those; everything
   * else is required.
   */
  optional?: boolean;
};

export function forkCloneList(): CloneEntry[] {
  const programs: CloneEntry[] = [
    {
      address: DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58(),
      kind: "program",
      label: "Meteora Dynamic Bonding Curve",
      neededFor: "launch, trade, claim, migrate",
    },
    {
      address: DAMM_V2_PROGRAM_ID.toBase58(),
      kind: "program",
      label: "Meteora DAMM v2",
      neededFor: "migrate (graduation creates the DAMM v2 pool)",
    },
    {
      address: METAPLEX_PROGRAM_ID.toBase58(),
      kind: "program",
      label: "Metaplex Token Metadata",
      neededFor: "launch (pool init writes the token's metadata account)",
    },
  ];

  // Program-owned PDAs that exist on mainnet as *funded system accounts*.
  // DAMM v2's pool authority pays the rent for the pool that graduation
  // creates; on a fork that has not cloned it, migration fails inside
  // `InitializePool` with "Transfer: insufficient lamports 0". Found by
  // running the flow on a fork, not by reading the SDK.
  const authorities: CloneEntry[] = [
    {
      address: deriveDammV2PoolAuthority().toBase58(),
      kind: "account",
      label: "DAMM v2 pool authority (funded PDA)",
      neededFor: "migrate (pays rent for the new DAMM v2 pool)",
    },
    {
      address: deriveDbcPoolAuthority().toBase58(),
      kind: "account",
      label: "DBC pool authority (funded PDA)",
      neededFor: "vault authority for every pool; funded on mainnet, so cloned as it is there",
    },
  ];

  // Only the DAMM v2 fee tiers some preset actually graduates into.
  const tiers = [...new Set(CURVE_PRESET_LIST.map((p) => Number(p.migrationFeeOption)))].sort();
  const dammConfigs: CloneEntry[] = tiers.map((tier) => ({
    address: DAMM_V2_MIGRATION_FEE_ADDRESS[tier].toBase58(),
    kind: "account",
    label: `DAMM v2 config, migration fee option ${tier} (${CURVE_PRESET_LIST.filter(
      (p) => Number(p.migrationFeeOption) === tier,
    )
      .map((p) => p.id)
      .join(", ")})`,
    neededFor: "migrate",
  }));

  const mints: CloneEntry[] = [
    {
      address: MAINNET_USDC,
      kind: "account",
      label: "USDC mint (Circle)",
      neededFor: "launch/trade of USDC-quoted equity pools",
    },
  ];

  // Every sponsored feed Juno reads, on every shard the reader checks.
  const pyth: CloneEntry[] = Object.entries(PYTH_FEEDS).flatMap(([name, feedId]) =>
    PYTH_SHARDS.map((shard) => ({
      address: priceFeedAccount(feedId, shard).toBase58(),
      kind: "account" as const,
      label: `Pyth ${name} (shard ${shard})`,
      // By default a fork reads Pyth from live mainnet (pyth-source.ts), so
      // these are only read when PYTH_RPC_URL points at the fork itself.
      neededFor: `${name.startsWith("Equity") ? "NAV band" : "USD pricing"}, only if PYTH_RPC_URL points at the fork`,
      optional: true,
    })),
  );

  return [...programs, ...authorities, ...dammConfigs, ...mints, ...pyth];
}

/**
 * `solana-test-validator` flags for a list. Upgradeable programs must be
 * cloned with `--clone-upgradeable-program` so the program data comes along.
 */
export function testValidatorArgs(entries: CloneEntry[]): string[] {
  return [
    "--url",
    "mainnet-beta",
    ...entries.flatMap((e) =>
      e.kind === "program" ? ["--clone-upgradeable-program", e.address] : ["--clone", e.address],
    ),
  ];
}
