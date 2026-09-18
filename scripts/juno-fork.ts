/**
 * The mainnet accounts a local fork must clone for Juno's issuance flow.
 *
 *   npm run juno:fork              # check every entry on mainnet, print flags
 *   npm run juno:fork -- --json    # machine-readable list
 *   npm run -s juno:fork -- --args # validator flags only, one token per line
 *
 * Read-only against mainnet: one `getMultipleAccountsInfo`, no transactions.
 * Then run the app against the fork with
 *   NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-fork   (RPC defaults to 127.0.0.1:8899)
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { forkCloneList, testValidatorArgs, type CloneEntry } from "../lib/juno/fork";

const MAINNET_RPC = process.env.MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";

async function main() {
  const entries = forkCloneList();
  const connection = new Connection(MAINNET_RPC, "confirmed");
  const infos = await connection.getMultipleAccountsInfo(entries.map((e) => new PublicKey(e.address)));

  const checked = entries.map((entry, i) => {
    const info = infos[i];
    return {
      ...entry,
      exists: info !== null,
      owner: info?.owner.toBase58() ?? null,
      executable: info?.executable ?? false,
      bytes: info?.data.length ?? 0,
    };
  });

  // Clone only what exists; a missing optional Pyth shard is expected.
  const toClone: CloneEntry[] = checked.filter((e) => e.exists);
  const missingRequired = checked.filter((e) => !e.exists && !e.optional);

  if (process.argv.includes("--args")) {
    console.log(testValidatorArgs(toClone).join("\n"));
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ mainnetRpc: MAINNET_RPC, entries: checked }, null, 2));
  } else {
    console.log(`checked against ${MAINNET_RPC}\n`);
    for (const e of checked) {
      const status = e.exists ? (e.kind === "program" && !e.executable ? "NOT EXECUTABLE" : "ok") : e.optional ? "absent (optional)" : "MISSING";
      console.log(`${status.padEnd(18)} ${e.kind.padEnd(8)} ${e.address}  ${e.label} — ${e.neededFor}`);
    }
    console.log(`\n${toClone.length} to clone, ${checked.length - toClone.length} absent on mainnet\n`);
    console.log("solana-test-validator --reset \\\n  " + chunk(testValidatorArgs(toClone)).join(" \\\n  "));
  }

  if (missingRequired.length > 0) {
    console.error(`\n❌ required but missing on mainnet: ${missingRequired.map((e) => e.address).join(", ")}`);
    process.exit(1);
  }
}

function chunk(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 2) out.push(`${args[i]} ${args[i + 1]}`);
  return out;
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
