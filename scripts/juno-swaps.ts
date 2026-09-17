/**
 * Print a pool's parsed swap history.
 *
 * The indexer has no UI of its own, so this is how you check that what it
 * reconstructs matches what the explorer shows.
 *
 *   npm run juno:swaps -- --mint <baseMint>
 *   npm run juno:swaps -- --pool <poolAddress> --mint <baseMint>
 */

import { PublicKey } from "@solana/web3.js";

import { cluster, explorer } from "../lib/juno/cluster";
import { getDbcClient } from "../lib/juno/dbc";
import {
  change24hPct,
  listSwaps,
  pricePoints,
  totalVolume,
  volume24h,
} from "../lib/juno/indexer";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const mint = arg("mint");
  if (!mint) throw new Error("Pass --mint <baseMint>");

  let pool = arg("pool");
  if (!pool) {
    const found = await getDbcClient().state.getPoolByBaseMint(new PublicKey(mint));
    if (!found) throw new Error(`No pool for mint ${mint} on ${cluster()}`);
    pool = found.publicKey.toBase58();
  }

  console.log(`cluster   ${cluster()}`);
  console.log(`pool      ${pool}`);
  console.log(`mint      ${mint}\n`);

  const started = Date.now();
  const history = await listSwaps(pool, mint);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (history === null) {
    console.log(`read FAILED after ${elapsed}s — RPC refused. Nothing is rendered.`);
    return;
  }

  console.log(
    `${history.swaps.length} swap(s) parsed in ${elapsed}s` +
      (history.truncated ? "  (TRUNCATED at the signature limit)" : "") +
      (history.missed > 0 ? `  (${history.missed} tx UNREADABLE — aggregates stand down)` : ""),
  );
  console.log("");

  for (const swap of [...history.swaps].reverse()) {
    const when = swap.blockTime
      ? new Date(swap.blockTime * 1000).toISOString().replace("T", " ").slice(0, 19)
      : "unknown time";
    console.log(
      [
        when,
        swap.side.toUpperCase().padEnd(4),
        `base ${swap.baseAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(16)}`,
        `quote ${swap.quoteAmount.toFixed(9).padStart(14)}`,
        `price ${swap.price.toExponential(6)}`,
        swap.trader.slice(0, 8),
        swap.signature.slice(0, 12),
      ].join("  "),
    );
  }

  const change = change24hPct(history);
  console.log(`\n24h volume    ${volume24h(history)?.toFixed(9) ?? "—"} (quote units)`);
  console.log(`total volume  ${totalVolume(history)?.toFixed(9) ?? "—"} (quote units)`);
  console.log(`24h change    ${change === null ? "— (needs two trades in the window)" : `${change.toFixed(2)}%`}`);
  console.log(`chart points  ${pricePoints(history).length}`);
  console.log(`\nexplorer      ${explorer.account(pool)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
