import "server-only";

// From @x402/core, not @x402/next: nothing here is Next-specific, and importing
// the Next build would drag `next/server` into plain-Node contexts (tests,
// scripts) that have no business loading it. The route owns the Next binding.
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  USDC_CONFIG,
  USDC_DECIMALS,
} from "@x402/avm";
import type { Network, Price } from "@x402/core/types";
import { algoNetwork } from "./constants";

/**
 * x402 — HTTP-native payments (https://x402.org) — for Norr's premium content.
 *
 * This is the machine-payable face of the same content humans unlock by tapping.
 * A human uses a prepaid custodial balance; an agent (or any x402 client) instead
 * gets a 402 carrying signed payment requirements, pays real USDC from its own
 * wallet, and the facilitator verifies + settles it on Algorand. Same asset, same
 * creator payout, no account required.
 *
 * Roles in the protocol:
 *  - *resource server* (this app) — prices a route, returns 402, verifies + settles
 *    via a facilitator. It never holds the payer's key.
 *  - *facilitator* (external) — verifies the signed payment and submits it on-chain.
 *  - *client* (the agent) — signs the payment with its own wallet.
 */

/**
 * The default facilitator. x402.org's facilitator is EVM-only — it does not
 * support Algorand — so the AVM-capable one is the default here. Verify support
 * with `GET /supported` before pointing this anywhere else.
 */
const DEFAULT_FACILITATOR_URL = "https://facilitator.goplausible.xyz";

export function facilitatorUrl(): string {
  return process.env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL;
}

/** CAIP-2 chain id for the active network — the identifier x402 speaks. */
export function x402Network(): Network {
  return algoNetwork() === "mainnet" ? ALGORAND_MAINNET_CAIP2 : ALGORAND_TESTNET_CAIP2;
}

/**
 * The USDC asset x402 prices in, per the SDK's own config.
 *
 * `lib/constants.ts` declares the same ids independently (it's client-shared and
 * must not pull algosdk into the browser bundle). `tests/unit/x402.test.ts`
 * asserts the two agree, so a divergence fails the build rather than silently
 * pricing in the wrong token.
 */
export function x402UsdcAsaId(): string {
  const config = USDC_CONFIG[x402Network()];
  if (!config) {
    throw new Error(`x402: no USDC configured for network ${x402Network()}`);
  }
  return config.asaId;
}

/**
 * The asset actually quoted in 402s. Discovery must report this and not plain
 * USDC — under a sandbox override they differ, and advertising an asset we don't
 * charge in would send a client to buy the wrong token.
 */
export function x402PaymentAsset(): { id: string; symbol: string; decimals: number } {
  const override = process.env.USDC_ASSET_ID_OVERRIDE?.trim();
  if (override) {
    return { id: override, symbol: "SANDBOX", decimals: USDC_DECIMALS };
  }
  return { id: x402UsdcAsaId(), symbol: "USDC", decimals: USDC_DECIMALS };
}

/**
 * Price a resource for x402.
 *
 * Normally this returns dollar notation and the AVM scheme's money parser
 * resolves it to USDC atomic units for the active network — prices stay
 * expressed the way the rest of the app stores them, and stay correct on both
 * networks automatically.
 *
 * `USDC_ASSET_ID_OVERRIDE` (the same sandbox escape hatch `getPaymentAssetId`
 * honours) pins the offer to an explicit asset instead. The SDK's USDC_CONFIG is
 * internal and can't be redirected, so without this the 402 would advertise real
 * USDC while the rest of the app settled a different asset — two sources of
 * truth. Never set it outside a local fork.
 */
export function x402Price(usd: string): Price {
  const override = process.env.USDC_ASSET_ID_OVERRIDE?.trim();
  if (override) {
    return { asset: override, amount: usdToAtomic(usd) };
  }
  return `$${Number(usd).toFixed(2)}`;
}

/** USD string -> 6dp atomic units, without float drift. */
function usdToAtomic(usd: string): string {
  const [whole, fraction = ""] = Number(usd).toFixed(USDC_DECIMALS).split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(USDC_DECIMALS) +
    BigInt(fraction.padEnd(USDC_DECIMALS, "0"))
  ).toString();
}

let cached: x402ResourceServer | null = null;

/**
 * The shared resource server. Registered for `algorand:*` so one instance serves
 * both networks; the route's `accepts.network` decides which one is offered.
 */
export function getX402Server(): x402ResourceServer {
  if (cached) return cached;
  cached = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: facilitatorUrl() }),
  ).register("algorand:*", new ExactAvmScheme());
  return cached;
}
