/**
 * Claim a creator's accrued trading fees from a Juno pool.
 *
 *   npm run juno:claim -- --mint <baseMint> --yes
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer } from "../lib/juno/cluster";
import {
  buildClaimCreatorFeesTransaction,
  fetchCreatorFees,
  getDbcClient,
  sendTransaction,
} from "../lib/juno/dbc";

function arg(n: string) {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const mint = arg("mint");
  if (!mint) throw new Error("Pass --mint <baseMint>");

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(".juno/launcher.json", "utf8"))),
  );
  const found = await getDbcClient().state.getPoolByBaseMint(new PublicKey(mint));
  if (!found) throw new Error(`No pool for mint ${mint} on ${cluster()}`);
  const pool = found.publicKey.toBase58();

  const before = await fetchCreatorFees(pool);
  console.log(`cluster     ${cluster()}`);
  console.log(`pool        ${pool}`);
  console.log(`claimable   quote ${before?.quoteAmount ?? 0} · base ${before?.baseAmount ?? 0}`);

  if (!process.argv.includes("--yes")) {
    console.log("\nAdd --yes to claim.");
    return;
  }
  if (!before || (before.quoteAmount <= 0 && before.baseAmount <= 0)) {
    console.log("\nNothing to claim.");
    return;
  }

  const transaction = await buildClaimCreatorFeesTransaction({
    creator: payer.publicKey,
    pool,
  });
  const signature = await sendTransaction({
    transaction,
    payer: payer.publicKey,
    signTransaction: async (tx) => { tx.partialSign(payer); return tx; },
  });

  const after = await fetchCreatorFees(pool);
  console.log(`\n✅ Claimed`);
  console.log(`tx          ${explorer.tx(signature)}`);
  console.log(`remaining   quote ${after?.quoteAmount ?? 0} · base ${after?.baseAmount ?? 0}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
