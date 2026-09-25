/**
 * Migrate a completed Juno curve into a Meteora DAMM v2 pool.
 *
 *   npm run juno:graduate -- --mint <baseMint> --yes
 *
 * Meteora runs keepers that do this automatically on mainnet for eligible
 * pools; this is the manual path, and the one devnet needs.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer } from "../lib/juno/cluster";
import { CURVE_PRESETS } from "../lib/juno/curves";
import {
  dammV2ConfigFor,
  fetchPoolSnapshot,
  getDbcClient,
  invalidatePoolSnapshot,
  planMigration,
  sendTransaction,
} from "../lib/juno/dbc";
import type { CurvePresetId } from "../lib/juno/types";

function arg(n: string, fallback?: string) {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const mint = arg("mint");
  if (!mint) throw new Error("Pass --mint <baseMint>");
  const preset = (arg("preset", "content") ?? "content") as CurvePresetId;

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta"
          ? ".juno/mainnet-launcher.json"
          : ".juno/launcher.json",
        "utf8",
      ))),
  );
  const found = await getDbcClient().state.getPoolByBaseMint(new PublicKey(mint));
  if (!found) throw new Error(`No pool for mint ${mint} on ${cluster()}`);
  const pool = found.publicKey.toBase58();

  const snapshot = await fetchPoolSnapshot(pool);
  if (!snapshot) throw new Error("Pool not readable");

  const dammConfig = dammV2ConfigFor(CURVE_PRESETS[preset].migrationFeeOption);
  console.log(`cluster      ${cluster()}`);
  console.log(`pool         ${pool}`);
  console.log(`progress     ${(snapshot.curve.progress * 100).toFixed(4)}%`);
  console.log(`graduated    ${snapshot.curve.graduated}`);
  console.log(`damm config  ${dammConfig.toBase58()}`);

  if (!process.argv.includes("--yes")) {
    console.log("\nAdd --yes to migrate.");
    return;
  }

  const plan = await planMigration({ payer: payer.publicKey, pool, dammConfig });
  const signature = await sendTransaction({
    transaction: plan.transaction,
    payer: payer.publicKey,
    signTransaction: async (tx) => { tx.partialSign(payer); return tx; },
    signers: plan.signers,
    onSent: (sig) => console.log(`\nsent         ${sig}`),
  });

  // The snapshot cache would otherwise answer with the pre-migration read.
  invalidatePoolSnapshot(pool);
  const after = await fetchPoolSnapshot(pool);
  console.log(`\n✅ Migrated to DAMM v2`);
  console.log(`tx           ${explorer.tx(signature)}`);
  console.log(`graduated    ${after?.curve.graduated}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
