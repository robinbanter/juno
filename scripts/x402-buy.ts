/**
 * An x402 client — buy Norr content the way an agent would.
 *
 * No account, no session, no card: it GETs a resource, receives a 402 carrying
 * signed payment requirements, pays real USDC from its own Algorand wallet, and
 * retries. The facilitator verifies the signed payment and settles it on-chain.
 *
 *   npm run x402:buy                 # buy the cheapest paid post
 *   npm run x402:buy -- <postId>     # buy a specific post
 *   npm run x402:buy -- --list       # just show what's for sale
 *
 * Wallet: set X402_BUYER_MNEMONIC (25 words) to the buyer's account. It needs
 * USDC on the active network, and to be opted in to it. It does NOT need ALGO —
 * the facilitator sponsors the transaction fee (see `extra.feePayer` in the 402).
 */
import algosdk from "algosdk";
import { x402Client } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { wrapFetchWithPayment } from "@x402/fetch";

const BASE = process.env.X402_TARGET_URL ?? "http://localhost:3000";

type Resource = {
  id: string;
  title: string;
  price: string;
  mediaType: string;
  url: string;
};

async function listResources(): Promise<{
  resources: Resource[];
  network: string;
  asset: { id: string; symbol: string };
  facilitator: string;
}> {
  const res = await fetch(`${BASE}/api/x402/posts`);
  if (!res.ok) throw new Error(`Discovery failed: HTTP ${res.status}`);
  return res.json();
}

function usd(price: string) {
  return Number(price.replace("$", ""));
}

async function main() {
  const args = process.argv.slice(2);
  const catalog = await listResources();

  console.log(`Network:     ${catalog.network}`);
  console.log(`Asset:       ${catalog.asset.symbol} (${catalog.asset.id})`);
  console.log(`Facilitator: ${catalog.facilitator}\n`);

  const paid = catalog.resources.filter((r) => usd(r.price) > 0);
  if (args.includes("--list")) {
    console.log(`${catalog.resources.length} resource(s), ${paid.length} paid:\n`);
    for (const r of catalog.resources) {
      console.log(`  ${r.price.padStart(7)}  ${r.id}  ${r.title}`);
    }
    return;
  }

  const explicitId = args.find((a) => !a.startsWith("--"));
  const target = explicitId
    ? catalog.resources.find((r) => r.id === explicitId)
    : paid.sort((a, b) => usd(a.price) - usd(b.price))[0];

  if (!target) {
    throw new Error(
      explicitId ? `No such resource: ${explicitId}` : "Nothing for sale right now",
    );
  }

  const mnemonic = process.env.X402_BUYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "X402_BUYER_MNEMONIC is not set — this script needs a wallet holding USDC to pay with",
    );
  }

  // toClientAvmSigner wants the base64 of the 64-byte ed25519 key.
  const account = algosdk.mnemonicToSecretKey(mnemonic.trim());
  const signer = toClientAvmSigner(Buffer.from(account.sk).toString("base64"));

  console.log(`Buyer:  ${signer.address}`);
  console.log(`Buying: ${target.title} (${target.price})`);
  console.log(`        ${target.url}\n`);

  // Register the AVM exact scheme for any Algorand network, then let the wrapped
  // fetch do the 402 dance: request -> 402 -> sign payment -> retry with header.
  const client = new x402Client().register("algorand:*", new ExactAvmScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const started = Date.now();
  const res = await fetchWithPayment(target.url);
  const elapsed = Date.now() - started;

  if (!res.ok) {
    console.error(`\n❌ HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }

  const body = (await res.json()) as { signedUrl?: string; [k: string]: unknown };
  console.log(`✅ Paid and unlocked in ${elapsed}ms\n`);
  console.log(JSON.stringify({ ...body, signedUrl: body.signedUrl ? "<signed url>" : null }, null, 2));

  // The settlement receipt: proof the payment actually landed on-chain.
  const receipt = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (receipt) {
    try {
      const decoded = JSON.parse(Buffer.from(receipt, "base64").toString());
      console.log(`\nSettlement: ${JSON.stringify(decoded)}`);
    } catch {
      console.log(`\nSettlement (raw): ${receipt}`);
    }
  }
  if (body.signedUrl) {
    const head = await fetch(String(body.signedUrl), { method: "HEAD" });
    console.log(`\nMedia URL is live: HTTP ${head.status} ${head.headers.get("content-type") ?? ""}`);
  }
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
