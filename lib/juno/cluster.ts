/**
 * Which Solana cluster Juno talks to, and how to link to it.
 *
 * The DBC program id is identical on mainnet and devnet, so the only thing
 * that changes between them is the RPC endpoint and the quote mint. Launching
 * against devnet first is the point: a config key and a base mint are both
 * permanent accounts, and getting the curve wrong on mainnet costs real SOL.
 *
 * `mainnet-fork` is the rehearsal between the two: a local validator seeded
 * with mainnet accounts (see `lib/juno/fork.ts`). It uses mainnet *addresses*
 * — Circle's USDC, mainnet Pyth accounts — against a local *endpoint*, so a
 * STOCKLANA issuance can be run end to end on real mainnet state without
 * spending anything. Those are two separate questions, and this module keeps
 * them apart: `usesMainnetAddresses()` for the first, `rpcEndpoint()` and
 * `explorer` for the second.
 */

export type Cluster = "devnet" | "mainnet-beta" | "mainnet-fork";

/**
 * The one place `NEXT_PUBLIC_SOLANA_CLUSTER` is interpreted. Everything that
 * depends on the cluster — addresses, RPC, explorer links, the Pyth source —
 * goes through here, so no two modules can disagree about which cluster this
 * is. Anything unrecognised is devnet, never mainnet.
 */
export function clusterFrom(env: Record<string, string | undefined>): Cluster {
  const value = env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  if (value === "mainnet-beta") return "mainnet-beta";
  if (value === "mainnet-fork") return "mainnet-fork";
  return "devnet";
}

export function cluster(): Cluster {
  return clusterFrom(process.env);
}

/** The real mainnet — where transactions cost real money. */
export function isMainnet(): boolean {
  return cluster() === "mainnet-beta";
}

/** Mainnet mints and accounts: true on mainnet itself and on a fork of it. */
export function usesMainnetAddresses(): boolean {
  return cluster() !== "devnet";
}

/** A local validator, where airdrops work and nothing is permanent. */
export function isFork(): boolean {
  return cluster() === "mainnet-fork";
}

const DEFAULT_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  // solana-test-validator and surfpool both listen here by default.
  "mainnet-fork": "http://127.0.0.1:8899",
};

/**
 * The public endpoints are rate-limited hard enough to break a live demo, so
 * a dedicated RPC is expected in `NEXT_PUBLIC_SOLANA_RPC`. Falling back is
 * deliberate — it keeps local dev working without credentials.
 */
export function rpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || DEFAULT_RPC[cluster()];
}

/** True only for the rate-limited public devnet/mainnet endpoints. */
export function usingPublicRpc(): boolean {
  return !process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() && !isFork();
}

/* ------------------------------------------------------------------ */
/* Explorer links — the proof a judge clicks                           */
/* ------------------------------------------------------------------ */

/**
 * Solscan indexes the public clusters only. A fork lives on a local RPC that
 * no hosted indexer can see, so its links go to the Solana Explorer pointed
 * at that RPC instead — the one explorer that reads a custom endpoint.
 */
function forkLink(path: string): string {
  return `https://explorer.solana.com/${path}?cluster=custom&customUrl=${encodeURIComponent(rpcEndpoint())}`;
}

function suffix(): string {
  return cluster() === "devnet" ? "?cluster=devnet" : "";
}

export const explorer = {
  tx: (signature: string) =>
    isFork() ? forkLink(`tx/${signature}`) : `https://solscan.io/tx/${signature}${suffix()}`,
  account: (address: string) =>
    isFork() ? forkLink(`address/${address}`) : `https://solscan.io/account/${address}${suffix()}`,
  token: (mint: string) =>
    isFork() ? forkLink(`address/${mint}`) : `https://solscan.io/token/${mint}${suffix()}`,
};

/**
 * Meteora's own pool page, which renders the curve rather than raw accounts.
 * Meteora cannot see a local fork, so there it falls back to the explorer.
 */
export function meteoraPoolUrl(poolAddress: string): string {
  return isFork() ? explorer.account(poolAddress) : `https://app.meteora.ag/dbc/${poolAddress}`;
}
