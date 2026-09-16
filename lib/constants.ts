/**
 * Network & protocol constants for Norr on Algorand.
 *
 * The payment token is **real USDC** (Circle's ASA), not a bespoke token:
 *   MainNet 31566704 · TestNet 10458941 — both 6 decimals.
 * Users fund themselves by sending USDC to their wallet; there is no treasury.
 */

/** Official USDC asset ids on Algorand. */
export const USDC_ASSET_ID = {
  mainnet: 31566704,
  testnet: 10458941,
} as const;

export type AlgoNetwork = keyof typeof USDC_ASSET_ID;

/** `mainnet` moves REAL money. Defaults to testnet unless explicitly set. */
export function algoNetwork(): AlgoNetwork {
  const raw = (
    process.env.NEXT_PUBLIC_ALGO_NETWORK ??
    process.env.ALGO_NETWORK ??
    "testnet"
  ).toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}

export const ALGORAND_NETWORKS = {
  mainnet: {
    name: "Algorand MainNet",
    algod: "https://mainnet-api.algonode.cloud",
    indexer: "https://mainnet-idx.algonode.cloud",
    explorer: "https://explorer.perawallet.app",
    dispenser: null,
  },
  testnet: {
    name: "Algorand TestNet",
    algod: "https://testnet-api.algonode.cloud",
    indexer: "https://testnet-idx.algonode.cloud",
    explorer: "https://testnet.explorer.perawallet.app",
    dispenser: "https://bank.testnet.algorand.network",
  },
} as const;

/** Config for the active network. */
export function algoConfig() {
  return ALGORAND_NETWORKS[algoNetwork()];
}

/** Explorer URL helpers (follow the active network). */
export const algoTxUrl = (txid: string) => `${algoConfig().explorer}/tx/${txid}`;
export const algoAssetUrl = (id: number | string) => `${algoConfig().explorer}/asset/${id}`;
export const algoAddressUrl = (addr: string) => `${algoConfig().explorer}/address/${addr}`;

/** USDC uses 6 decimals on both networks. */
export const STABLECOIN_DECIMALS = 6;

/** Loyalty points awarded per post unlock. */
export const POINTS_PER_UNLOCK = 10;

/**
 * Default unlock prices in stablecoin USD units, used as fallbacks when a
 * creator's draft omits a price. A "full" post unlocks once for
 * DEFAULT_POST_PRICE; a "partial" post charges DEFAULT_REVEAL_PRICE per region
 * reveal (per tap), so it sits a notch lower.
 */
export const DEFAULT_POST_PRICE = "3.00";
export const DEFAULT_REVEAL_PRICE = "1.50";

/** Platform revenue cut (the rest goes to the creator). */
export const PLATFORM_CUT = 0.1;
export const CREATOR_CUT = 1 - PLATFORM_CUT;

/** Default access-key spending cap, in 6-decimal units ($25). */
export const DEFAULT_SPEND_CAP = "25000000";

/**
 * Format a stored price/amount string (e.g. "0.25000000") for display:
 * trims trailing zeros, keeps at least 2 decimals. The raw string is what
 * gets passed to parseUnits — only the *display* is formatted.
 */
export function formatUsd(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "0.00";
  const trimmed = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [int, frac = ""] = trimmed.split(".");
  const padded = frac.length < 2 ? (frac + "00").slice(0, 2) : frac;
  return `${int}.${padded}`;
}

export const APP_NAME = "Norr";

// Absolute base URL for share links / OG cards / webhooks. Resilient to the
// common misconfigurations: an EMPTY-STRING env var (not nullish, so `?? ` keeps
// it) and a scheme-less host. Falls back to Vercel's injected deployment host
// (server-side only — these are not NEXT_PUBLIC) before localhost.
function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

export const APP_URL = resolveAppUrl();
