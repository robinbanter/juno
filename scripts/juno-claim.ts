/**
 * Claim a creator's accrued trading fees from a Juno pool.
 *
 * The same `planCreatorClaim` / `claimCreatorFees` the Manage view's Claim
 * button calls, signed by the launcher key instead of a browser wallet.
 *
 *   npm run juno:claim -- --mint <baseMint>              # read only
 *   npm run juno:claim -- --mint <baseMint> --simulate   # build + simulate
 *   npm run juno:claim -- --mint <baseMint> --yes        # send
 */
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer } from "../lib/juno/cluster";
import { keypairSigner, simulateTransaction } from "../lib/juno/dbc";
import {
  claimCreatorFees,
  planCreatorClaim,
  readIssuerState,
  resolvePoolAddress,
} from "../lib/juno/issuer";

function arg(n: string) {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(".juno/launcher.json", "utf8"))),
  );
  const pool = await resolvePoolAddress({ mint: arg("mint"), pool: arg("pool") });
  const state = await readIssuerState(pool, { fresh: true });
  if (!state) throw new Error(`Pool ${pool} not readable on ${cluster()}`);

  const symbol = state.quoteMint.startsWith("So111") ? "SOL" : "quote";
  console.log(`cluster     ${cluster()}`);
  console.log(`pool        ${pool}`);
  console.log(`creator     ${state.creator}`);
  console.log(`signer      ${payer.publicKey.toBase58()}`);
  console.log(`claimable   ${state.claimable?.quote ?? "unreadable"} ${symbol} · base ${state.claimable?.base ?? "unreadable"}`);

  if (flag("simulate")) {
    const plan = await planCreatorClaim({ pool, creator: payer.publicKey });
    const sim = await simulateTransaction({ transaction: plan.transaction, payer: payer.publicKey });
    console.log(`\nsimulate    ${sim.ok ? "OK" : `FAILED ${JSON.stringify(sim.err)}`} · ${sim.unitsConsumed} CU`);
    for (const line of sim.logs.filter((l) => /Instruction:|success|failed|error/i.test(l))) {
      console.log(`  ${line}`);
    }
    if (!sim.ok) process.exit(1);
    return;
  }

  if (!flag("yes")) {
    console.log("\nAdd --simulate to dry-run, --yes to claim.");
    return;
  }

  const receipt = await claimCreatorFees({
    pool,
    creator: payer.publicKey,
    signTransaction: keypairSigner(payer),
    onSent: (sig) => console.log(`\nsent        ${sig}`),
  });
  console.log(`\n✅ Claimed   ${receipt.claimed ? `${receipt.claimed.quote} ${symbol} · base ${receipt.claimed.base}` : `up to ${receipt.requested.quote} ${symbol} (post-claim read failed)`}`);
  console.log(`tx          ${explorer.tx(receipt.signature)}`);
  console.log(`remaining   ${receipt.remaining?.quote ?? "unreadable"} ${symbol} · base ${receipt.remaining?.base ?? "unreadable"}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
