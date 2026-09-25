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

/**
 * Meteora's own pool page, or null when there is not one to link to.
 *
 * `app.meteora.ag` serves mainnet only. Pointed at a devnet pool it does not
 * show an empty curve, it serves its own 404 — so the one link on the coin
 * page that was supposed to prove the DBC integration was, on the cluster
 * this app actually runs on, guaranteed to be broken. A dead proof link is
 * worse than no proof link: it invites the click and then contradicts the
 * claim.
 *
 * Null rather than a devnet-shaped URL, because there is no such page to
 * construct. The caller omits the link entirely; the Solscan links beside it
 * are cluster-aware and still prove the accounts exist.
 */
export function marketUrl(mint: string): string | null {
  if (cluster() !== "mainnet-beta") return null;
  // Jupiter, not Meteora: Meteora's app has no page for a DBC pool — the
  // `/dbc/<pool>` link this used to build lands on its error page — while
  // Jupiter indexes every DBC token with its chart, trades and holders.
  return `https://jup.ag/tokens/${mint}`;
}
