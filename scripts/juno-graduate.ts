/**
 * Migrate a completed Juno curve into a Meteora DAMM v2 pool.
 *
 * The same `planGraduation` / `graduatePool` the Manage view's Migrate button
 * calls. The DAMM v2 fee tier is read off the pool's config, so there is no
 * preset flag to get wrong.
 *
 *   npm run juno:graduate -- --mint <baseMint>              # read only
 *   npm run juno:graduate -- --mint <baseMint> --simulate   # build + simulate
 *   npm run juno:graduate -- --mint <baseMint> --yes        # send
 *
 * Meteora runs keepers that do this automatically on mainnet for eligible
 * pools; this is the manual path, and the one devnet needs.
 */
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer } from "../lib/juno/cluster";
import { keypairSigner, simulateTransaction } from "../lib/juno/dbc";
import {
  graduatePool,
  planGraduation,
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

  console.log(`cluster      ${cluster()}`);
  console.log(`pool         ${pool}`);
  console.log(`progress     ${(state.progress * 100).toFixed(4)}%`);
  console.log(`graduated    ${state.graduated}`);
  console.log(`fee tier     migrationFeeOption ${state.migrationFeeOption}`);
  console.log(`damm config  ${state.dammConfig}`);
  console.log(`damm pool    ${state.dammPool}`);

  if (flag("simulate")) {
    const plan = await planGraduation({ pool, payer: payer.publicKey });
    const sim = await simulateTransaction({
      transaction: plan.transaction,
      payer: payer.publicKey,
      signers: plan.signers,
    });
    console.log(`\nsimulate     ${sim.ok ? "OK" : `FAILED ${JSON.stringify(sim.err)}`} · ${sim.unitsConsumed} CU`);
    if (!sim.ok) {
      for (const line of sim.logs.slice(-12)) console.log(`  ${line}`);
      process.exit(1);
    }
    return;
  }

  if (!flag("yes")) {
    console.log("\nAdd --simulate to dry-run, --yes to migrate.");
    return;
  }

  const receipt = await graduatePool({
    pool,
    payer: payer.publicKey,
    signTransaction: keypairSigner(payer),
    onSent: (sig) => console.log(`\nsent         ${sig}`),
  });
  console.log(`\n✅ Migrated to DAMM v2`);
  console.log(`tx           ${explorer.tx(receipt.signature)}`);
  console.log(`damm pool    ${explorer.account(receipt.dammPool)}`);
  console.log(`graduated    ${receipt.graduated}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
