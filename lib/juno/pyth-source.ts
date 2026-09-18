/**
 * Where Pyth prices are read from, per cluster.
 *
 * The Receiver and push-oracle program ids, and therefore every price-account
 * address, are identical on devnet and mainnet. What differs is which copy is
 * kept fresh — devnet's pusher runs SOL/USDC/USDT only, and stopped updating
 * US equities on 2026-07-02 — so the source has to follow the cluster.
 *
 * `mainnet-fork` (alias `localnet-fork`) is a local validator seeded from mainnet. Its Pyth accounts
 * are clones taken when the validator started, and nothing pushes to them
 * afterwards: a cloned SOL/USD is exactly as fresh as the fork is young, then
 * goes stale for good. So on a fork the prices are read from mainnet itself
 * (read-only, no transactions), which is the state the fork was copied from.
 * `PYTH_RPC_URL` overrides this — point it at the fork to read the clones.
 *
 * The cluster is selected by `clusterFrom` in `cluster.ts`, the same function
 * the rest of the app uses, so the Pyth source can never disagree with it.
 */

import { clusterFrom } from "./cluster";

export type PythNetwork = "devnet" | "mainnet-beta";

export type PythSource = {
  /** Which network's Pyth state the prices are. */
  network: PythNetwork;
  /** Null: use the app's own connection. */
  rpc: string | null;
  /** Past this many seconds, a price is shown as stale, not as a number. */
  maxAgeSeconds: number;
};

const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Staleness bounds, about twice each network's measured push interval:
 * devnet SOL/USD published every 313–315 s on 2026-09-18; mainnet sponsored
 * feeds default to a 60 s heartbeat, and its equities were seconds old.
 */
const MAX_AGE: Record<PythNetwork, number> = { devnet: 600, "mainnet-beta": 180 };

export function pythSource(env: Record<string, string | undefined> = process.env): PythSource {
  const clusterName = clusterFrom(env);
  const override = env.PYTH_RPC_URL?.trim() || null;
  const network: PythNetwork = clusterName === "devnet" ? "devnet" : "mainnet-beta";
  const rpc = override ?? (clusterName === "mainnet-fork" ? MAINNET_RPC : null);
  return {
    network,
    rpc,
    maxAgeSeconds: Number(env.PYTH_MAX_AGE_SECONDS) || MAX_AGE[network],
  };
}

/** Solscan link for a Pyth account, on the network the price was read from. */
export function pythAccountUrl(address: string, source: PythSource = pythSource()): string {
  return `https://solscan.io/account/${address}${source.network === "devnet" ? "?cluster=devnet" : ""}`;
}
