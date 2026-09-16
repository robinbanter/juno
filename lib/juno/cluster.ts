/**
 * Which Solana cluster Juno talks to, and how to link to it.
 *
 * The DBC program id is identical on mainnet and devnet, so the only thing
 * that changes between them is the RPC endpoint and the quote mint. Launching
 * against devnet first is the point: a config key and a base mint are both
 * permanent accounts, and getting the curve wrong on mainnet costs real SOL.
 */

export type Cluster = "devnet" | "mainnet-beta";

export function cluster(): Cluster {
  const value = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  return value === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function isMainnet(): boolean {
  return cluster() === "mainnet-beta";
}

const PUBLIC_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/**
 * The public endpoints are rate-limited hard enough to break a live demo, so
 * a dedicated RPC is expected in `NEXT_PUBLIC_SOLANA_RPC`. Falling back is
 * deliberate — it keeps local dev working without credentials.
 */
export function rpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || PUBLIC_RPC[cluster()];
}

export function usingPublicRpc(): boolean {
  return !process.env.NEXT_PUBLIC_SOLANA_RPC?.trim();
}

/* ------------------------------------------------------------------ */
/* Explorer links — the proof a judge clicks                           */
/* ------------------------------------------------------------------ */

function suffix(): string {
  return cluster() === "devnet" ? "?cluster=devnet" : "";
}

export const explorer = {
  tx: (signature: string) => `https://solscan.io/tx/${signature}${suffix()}`,
  account: (address: string) => `https://solscan.io/account/${address}${suffix()}`,
  token: (mint: string) => `https://solscan.io/token/${mint}${suffix()}`,
};

/** Meteora's own pool page, which renders the curve rather than raw accounts. */
export function meteoraPoolUrl(poolAddress: string): string {
  return `https://app.meteora.ag/dbc/${poolAddress}`;
}
