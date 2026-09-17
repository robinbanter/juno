/**
 * Launch a Juno pool from the command line.
 *
 * Runs the exact `planLaunch` path the create form uses, signed by a local
 * keypair instead of a browser wallet. That makes it the fastest way to prove
 * the curve config is accepted on-chain, and it produces the explorer links
 * the submission needs.
 *
 *   npm run juno:launch -- --preset ipo-book --name "AAPLx Issuance" --symbol AAPLXI
 *
 * Defaults to devnet. Pass --mainnet only once devnet has worked.
 */

import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { cluster, explorer, meteoraPoolUrl, rpcEndpoint } from "../lib/juno/cluster";
import { getConnection, planLaunch, sendLaunch, USDC, WSOL } from "../lib/juno/dbc";
import { CURVE_PRESETS } from "../lib/juno/curves";
import { pinTokenMetadata } from "../lib/juno/pinata";
import type { CurvePresetId } from "../lib/juno/types";

const KEY_PATH = path.resolve(process.cwd(), ".juno/launcher.json");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Reuse one launcher key so repeated runs do not need repeated airdrops. */
function loadKeypair(): Keypair {
  if (existsSync(KEY_PATH)) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(KEY_PATH, "utf8"))),
    );
  }
  const kp = Keypair.generate();
  mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify([...kp.secretKey]));
  console.log(`Generated launcher key at ${KEY_PATH}`);
  return kp;
}

async function main() {
  const preset = (arg("preset", "ipo-book") ?? "ipo-book") as CurvePresetId;
  if (!CURVE_PRESETS[preset]) {
    throw new Error(
      `Unknown preset "${preset}". One of: ${Object.keys(CURVE_PRESETS).join(", ")}`,
    );
  }

  const name = arg("name", "Juno Test Issuance")!;
  const symbol = arg("symbol", "JUNOTEST")!;
  // SOL is the safe default on devnet: it is the only quote mint guaranteed to
  // exist there. USDC is the right choice for an equity-shaped mainnet launch.
  const quote = arg("quote") === "usdc" ? USDC : WSOL;
  const initialMarketCap = Number(arg("initial", "1000"));
  const migrationMarketCap = Number(arg("migration", "25000"));

  const payer = loadKeypair();
  const connection = getConnection();

  console.log(`cluster   ${cluster()}`);
  console.log(`rpc       ${rpcEndpoint()}`);
  console.log(`launcher  ${payer.publicKey.toBase58()}`);
  console.log(`preset    ${CURVE_PRESETS[preset].label} — ${CURVE_PRESETS[preset].tagline}`);
  console.log(`quote     ${quote.symbol} (${quote.mint})`);

  let balance = await connection.getBalance(payer.publicKey);
  console.log(`balance   ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    if (cluster() !== "devnet") {
      throw new Error(
        `Launcher needs SOL. Fund ${payer.publicKey.toBase58()} and re-run.`,
      );
    }
    console.log("Requesting devnet airdrop…");
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(payer.publicKey);
      console.log(`balance   ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch {
      // The devnet faucet rate-limits aggressively; say what to do rather than
      // failing with a raw RPC error.
      throw new Error(
        `Airdrop failed (faucet is rate-limited). Fund ${payer.publicKey.toBase58()} ` +
          `at https://faucet.solana.com and re-run.`,
      );
    }
  }

  if (!flag("yes")) {
    console.log("\nAdd --yes to send this transaction.");
    return;
  }

  // Pin metadata before building. The URI is permanent once the mint exists.
  let uri = "";
  if (process.env.PINATA_JWT) {
    const pinned = await pinTokenMetadata({
      name,
      symbol,
      description: arg("description", "") ?? "",
      imageUrl: arg("image", "") ?? "",
      attributes: [
        { trait_type: "Curve", value: CURVE_PRESETS[preset].label },
        { trait_type: "Launchpad", value: "Juno" },
        { trait_type: "Market", value: "Meteora Dynamic Bonding Curve" },
        ...(arg("nav") ? [{ trait_type: "NAV feed", value: arg("nav")! }] : []),
      ],
    });
    uri = pinned.uri;
    console.log(`metadata  ${pinned.url}`);
  } else {
    console.log("metadata  skipped (no PINATA_JWT)");
  }

  console.log("\nBuilding…");
  const plan = await planLaunch({
    payer: payer.publicKey,
    creator: payer.publicKey,
    quote,
    name,
    symbol,
    uri,
    preset,
    initialMarketCap,
    migrationMarketCap,
  });

  console.log("Sending…");
  const signatures = await sendLaunch({
    plan,
    payer: payer.publicKey,
    // Stands in for the wallet adapter: same interface, local key.
    signTransaction: async (tx) => {
      tx.partialSign(payer);
      return tx;
    },
    onStep: ({ index, total, label }) => console.log(`  [${index + 1}/${total}] ${label}`),
  });

  console.log("\n✅ Pool is live\n");
  signatures.forEach((sig, i) => console.log(`tx ${i + 1}      ${explorer.tx(sig)}`));
  console.log(`pool      ${explorer.account(plan.pool.toBase58())}`);
  console.log(`mint      ${explorer.token(plan.baseMint.toBase58())}`);
  console.log(`config    ${explorer.account(plan.config.toBase58())}`);
  console.log(`meteora   ${meteoraPoolUrl(plan.pool.toBase58())}`);
  console.log(`\napp       /coin/${plan.baseMint.toBase58()}`);
  if (uri) console.log(`metadata  ${uri}`);
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
