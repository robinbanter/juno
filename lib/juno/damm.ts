import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  deriveDammV2PoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PublicKey } from "@solana/web3.js";

import { CURVE_PRESETS } from "./curves";
import type { Coin } from "./types";

/**
 * The DAMM v2 pool a graduated coin migrated into.
 *
 * Derived rather than stored: the address is a PDA of the migration fee
 * config, base mint and quote mint, and the fee config follows from the curve
 * preset chosen at launch. Nothing to persist, nothing to get out of sync.
 */
export function dammV2PoolFor(coin: Coin): string | null {
  const preset = CURVE_PRESETS[coin.curvePreset];
  if (!preset) return null;

  const config = DAMM_V2_MIGRATION_FEE_ADDRESS[preset.migrationFeeOption];
  if (!config) return null;

  try {
    return deriveDammV2PoolAddress(
      config,
      new PublicKey(coin.address),
      new PublicKey(coin.quote.mint),
    ).toBase58();
  } catch {
    return null;
  }
}
