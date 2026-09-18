/**
 * Read a live Juno pool back off-chain — the CLI face of the Manage view.
 *
 * Prints the same `readIssuerState` the creator's Manage view renders, then
 * prices a quote through the coin page's `quoteTrade`, so a failure here is a
 * failure in the app, not just the script.
 *
 *   npm run juno:inspect -- --mint <baseMint>
 */
import { cluster, explorer, meteoraPoolUrl } from "../lib/juno/cluster";
import { fetchPoolSnapshot, quoteTrade } from "../lib/juno/dbc";
import { dammPoolExists, readIssuerState, resolvePoolAddress } from "../lib/juno/issuer";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const pool = await resolvePoolAddress({ mint: arg("mint"), pool: arg("pool") });
  const s = await readIssuerState(pool, { fresh: true });
  if (!s) throw new Error(`Pool ${pool} not found on ${cluster()}`);

  console.log(`cluster            ${cluster()}`);
  console.log(`pool               ${pool}`);
  console.log(`base mint          ${s.baseMint}`);
  console.log(`creator            ${s.creator}`);
  console.log(`preset (on-chain)  ${s.preset ? `${s.preset.label} (${s.preset.id})` : "not a Juno preset"}`);
  console.log(`decimals           base ${s.baseDecimals} · quote ${s.quoteDecimals}`);
  console.log(`price (quote/base) ${s.price}`);
  console.log(`quote reserve      ${s.quoteReserve}`);
  console.log(`threshold          ${s.migrationThreshold}`);
  console.log(`curve progress     ${(s.progress * 100).toFixed(4)}%`);
  console.log(`graduated          ${s.graduated}`);
  if (s.fee) {
    console.log(`fee now            ${s.fee.currentBps} bps (open ${s.fee.startBps} → floor ${s.fee.endBps}, ${s.fee.mode})`);
    console.log(`fee period         ${s.fee.period}/${s.fee.totalPeriods} · ${s.fee.secondsRemaining}s to floor`);
  }
  console.log(`liquidity weights  ${s.shape.points.map((p) => p.weight.toFixed(2)).join(" ")}`);
  console.log(`claimable          quote ${s.claimable?.quote ?? "unreadable"} · base ${s.claimable?.base ?? "unreadable"}`);
  console.log(`damm v2 pool       ${s.dammPool}${s.dammPool ? ` (exists: ${await dammPoolExists(s.dammPool)})` : ""}`);

  // A quote proves the curve math runs against real account state. A migrated
  // curve rejects swaps, so it has nothing to quote.
  if (!s.graduated) {
    const snapshot = await fetchPoolSnapshot(pool);
    const buy = await quoteTrade({ snapshot: snapshot!, side: "buy", amountIn: 0.01 });
    console.log(`\nquote: buy 0.01 quote-token`);
    console.log(`  out              ${buy.amountOut}`);
    console.log(`  fee              ${buy.fee}`);
    console.log(`  price impact     ${(buy.priceImpact * 100).toFixed(4)}%`);
  }

  console.log(`\nexplorer           ${explorer.account(pool)}`);
  console.log(`meteora            ${meteoraPoolUrl(pool)}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
