/**
 * Execute a real swap against a live Juno pool.
 *
 * Runs the same `quoteTrade` → `buildSwapTransaction` → `sendTransaction`
 * path the coin page uses, signed by the local launcher key instead of a
 * browser wallet.
 *
 *   npm run juno:trade -- --mint <baseMint> --side buy --amount 0.1 --yes
 *   npm run juno:trade -- --mint <baseMint> --out 1000000 --yes   # exactly 1M tokens
 */
import { Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer } from "../lib/juno/cluster";
import {
  buildExactOutBuyTransaction,
  buildPartialFillSwapTransaction,
  buildSwapTransaction,
  fetchPoolSnapshot,
  getDbcClient,
  invalidatePoolSnapshot,
  quoteExactOutBuy,
  quoteTrade,
  sendTransaction,
} from "../lib/juno/dbc";
import type { TradeSide } from "../lib/juno/types";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const mint = arg("mint");
  if (!mint) throw new Error("Pass --mint <baseMint>");
  const side = (arg("side", "buy") ?? "buy") as TradeSide;
  const amountIn = Number(arg("amount", "0.1"));

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta"
          ? ".juno/mainnet-launcher.json"
          : ".juno/launcher.json",
        "utf8",
      ))),
  );

  // `--pool` skips the lookup, which scans the DBC program with
  // getProgramAccounts — a call the public mainnet RPC often refuses.
  let poolAddress = arg("pool");
  if (!poolAddress) {
    const found = await getDbcClient().state.getPoolByBaseMint(new PublicKey(mint));
    if (!found) throw new Error(`No pool for mint ${mint} on ${cluster()}`);
    poolAddress = found.publicKey.toBase58();
  }

  const snapshot = await fetchPoolSnapshot(poolAddress);
  if (!snapshot) throw new Error("Pool not readable");

  // Exact-out: name the tokens, let the curve name the price.
  const exactOut = arg("out") === undefined ? null : Number(arg("out"));
  const outQuote =
    exactOut === null
      ? null
      : await quoteExactOutBuy({ snapshot, amountOut: exactOut, slippageBps: 300 });
  if (outQuote) {
    console.log(`cluster        ${cluster()}`);
    console.log(`pool           ${poolAddress}`);
    console.log(`mode           exact out (SwapMode.ExactOut)`);
    console.log(`tokens wanted  ${exactOut}`);
    console.log(`expected cost  ${outQuote.amountIn}`);
    console.log(`maximum cost   ${outQuote.maximumAmountIn}`);
    console.log(`fee            ${outQuote.fee}`);
    console.log(`price impact   ${(outQuote.priceImpact * 100).toFixed(4)}%`);
  }

  const partial = process.argv.includes("--partial");
  // An exact-in quote throws once the input exceeds the curve's remaining
  // capacity — which is precisely when a partial fill is the right tool, so
  // the quote is skipped rather than allowed to block it.
  const quote = partial || outQuote
    ? null
    : await quoteTrade({ snapshot, side, amountIn, slippageBps: 300 });
  if (!outQuote) {
    console.log(`cluster        ${cluster()}`);
    console.log(`pool           ${poolAddress}`);
    console.log(`side           ${side}`);
    console.log(`amount in      ${amountIn}`);
  }
  if (outQuote) {
    // printed above
  } else if (quote) {
    console.log(`expected out   ${quote.amountOut}`);
    console.log(`minimum out    ${quote.minimumAmountOut}`);
    console.log(`fee            ${quote.fee}`);
    console.log(`price impact   ${(quote.priceImpact * 100).toFixed(4)}%`);
  } else {
    console.log(`mode           partial fill (up to ${amountIn})`);
  }

  if (!process.argv.includes("--yes")) {
    console.log("\nAdd --yes to send.");
    return;
  }

  const transaction = outQuote
    ? await buildExactOutBuyTransaction({
        snapshot,
        owner: payer.publicKey,
        amountOut: exactOut!,
        maximumAmountIn: outQuote.maximumAmountIn,
      })
    : partial
    ? await buildPartialFillSwapTransaction({
        snapshot,
        owner: payer.publicKey,
        side,
        amountIn,
      })
    : await buildSwapTransaction({
        snapshot,
        owner: payer.publicKey,
        side,
        amountIn,
        minimumAmountOut: quote!.minimumAmountOut,
      });

  const signature = await sendTransaction({
    transaction,
    payer: payer.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(payer);
      return tx;
    },
    onSent: (sig) => console.log(`\nsent           ${sig}`),
  });

  // The snapshot cache would otherwise answer with the pre-trade read.
  invalidatePoolSnapshot(poolAddress);
  const after = await fetchPoolSnapshot(poolAddress);
  console.log(`\n✅ Trade confirmed`);
  console.log(`tx             ${explorer.tx(signature)}`);
  console.log(`curve progress ${(snapshot.curve.progress * 100).toFixed(4)}% → ${((after?.curve.progress ?? 0) * 100).toFixed(4)}%`);
  console.log(`price          ${snapshot.price} → ${after?.price}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
