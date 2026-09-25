/**
 * Read a live Juno pool back off-chain.
 *
 * Exercises the same `fetchPoolSnapshot` / `quoteTrade` path the coin page
 * uses, so a failure here is a failure in the app, not just the script.
 *
 *   npm run juno:inspect -- --mint <baseMint>
 */
import { PublicKey } from "@solana/web3.js";

import { cluster, explorer, marketUrl } from "../lib/juno/cluster";
import { fetchPoolSnapshot, getDbcClient, quoteTrade } from "../lib/juno/dbc";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const mint = arg("mint");
  const poolArg = arg("pool");
  if (!mint && !poolArg) throw new Error("Pass --mint <baseMint> or --pool <poolAddress>");

  const client = getDbcClient();
  let pool = poolArg;
  if (!pool && mint) {
    const found = await client.state.getPoolByBaseMint(new PublicKey(mint));
    if (!found) throw new Error(`No DBC pool found for mint ${mint} on ${cluster()}`);
    pool = found.publicKey.toBase58();
  }

  const snapshot = await fetchPoolSnapshot(pool!);
  if (!snapshot) throw new Error(`Pool ${pool} not found on ${cluster()}`);

  console.log(`cluster            ${cluster()}`);
  console.log(`pool               ${pool}`);
  console.log(`base decimals      ${snapshot.baseDecimals}`);
  console.log(`quote decimals     ${snapshot.quoteDecimals}`);
  console.log(`price (quote/base) ${snapshot.price}`);
  console.log(`curve progress     ${(snapshot.curve.progress * 100).toFixed(4)}%`);
  console.log(`raised             ${snapshot.curve.raisedUsd}`);
  console.log(`threshold          ${snapshot.curve.thresholdUsd}`);
  console.log(`graduated          ${snapshot.curve.graduated}`);

  // A quote proves the curve math runs against real account state.
  const buy = await quoteTrade({ snapshot, side: "buy", amountIn: 10 });
  console.log(`\nquote: buy 10 quote-token`);
  console.log(`  out              ${buy.amountOut}`);
  console.log(`  min out          ${buy.minimumAmountOut}`);
  console.log(`  fee              ${buy.fee}`);
  console.log(`  price impact     ${(buy.priceImpact * 100).toFixed(4)}%`);

  console.log(`\nexplorer           ${explorer.account(pool!)}`);
  if (mint) console.log(`jupiter            ${marketUrl(mint)}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
