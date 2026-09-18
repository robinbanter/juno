/**
 * Execute a real swap against a live Juno pool.
 *
 * Runs the same `quoteTrade` → `buildSwapTransaction` → `sendTransaction`
 * path the coin page uses, signed by the local launcher key instead of a
 * browser wallet.
 *
 *   npm run juno:trade -- --mint <baseMint> --side buy --amount 0.1 --yes
 *   npm run juno:trade -- --mint <baseMint> --side buy --amount 1 --partial --simulate
 *
 * Every swap carries a minimum output derived from a real quote, with the same
 * slippage tolerance the UI uses (`DEFAULT_SLIPPAGE_BPS`; override with
 * --slippage-bps). A partial fill is quoted in partial-fill mode, because an
 * exact-in quote throws exactly when a partial fill is needed.
 *
 * --no-slippage-protection sends a zero minimum, which the DBC program fills
 * at ANY price. It exists only for deliberate devnet experiments and prints a
 * warning; it is never the default.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";

import { cluster, explorer, isMainnet } from "../lib/juno/cluster";
import {
  DEFAULT_SLIPPAGE_BPS,
  buildPartialFillSwapTransaction,
  buildSwapTransaction,
  fetchPoolSnapshot,
  getDbcClient,
  invalidatePoolSnapshot,
  keypairSigner,
  quotePartialFill,
  quoteTrade,
  sendTransaction,
  simulateTransaction,
} from "../lib/juno/dbc";
import type { TradeSide } from "../lib/juno/types";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const mint = arg("mint");
  if (!mint) throw new Error("Pass --mint <baseMint>");
  const side = (arg("side", "buy") ?? "buy") as TradeSide;
  const amountIn = Number(arg("amount", "0.1"));
  const slippageBps = Number(arg("slippage-bps", String(DEFAULT_SLIPPAGE_BPS)));
  if (!(slippageBps > 0 && slippageBps < 10_000)) {
    throw new Error("--slippage-bps must be between 1 and 9999");
  }
  const partial = flag("partial");
  const unprotected = flag("no-slippage-protection");

  if (unprotected) {
    console.warn(
      "\n⚠️  --no-slippage-protection: this swap is sent with minimumAmountOut = 0.\n" +
        "   The DBC program will fill it at ANY price. Anyone can front-run or sandwich it.\n",
    );
    if (isMainnet()) {
      throw new Error("--no-slippage-protection is refused on mainnet-beta.");
    }
  }

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(".juno/launcher.json", "utf8"))),
  );

  const found = await getDbcClient().state.getPoolByBaseMint(new PublicKey(mint));
  if (!found) throw new Error(`No pool for mint ${mint} on ${cluster()}`);
  const poolAddress = found.publicKey.toBase58();

  const snapshot = await fetchPoolSnapshot(poolAddress);
  if (!snapshot) throw new Error("Pool not readable");

  console.log(`cluster        ${cluster()}`);
  console.log(`pool           ${poolAddress}`);
  console.log(`side           ${side}`);
  console.log(`amount in      ${amountIn}${partial ? " (upper bound, partial fill)" : ""}`);
  console.log(`slippage       ${unprotected ? "NONE (--no-slippage-protection)" : `${slippageBps} bps`}`);

  let minimumAmountOut: number;
  if (partial) {
    const quote = await quotePartialFill({ snapshot, side, amountIn, slippageBps });
    minimumAmountOut = quote.minimumAmountOut;
    console.log(`fills          ${quote.amountIn}`);
    console.log(`expected out   ${quote.amountOut}`);
    console.log(`minimum out    ${unprotected ? "0 (unprotected)" : quote.minimumAmountOut}`);
  } else {
    const quote = await quoteTrade({ snapshot, side, amountIn, slippageBps });
    minimumAmountOut = quote.minimumAmountOut;
    console.log(`expected out   ${quote.amountOut}`);
    console.log(`minimum out    ${unprotected ? "0 (unprotected)" : quote.minimumAmountOut}`);
    console.log(`fee            ${quote.fee}`);
    console.log(`price impact   ${(quote.priceImpact * 100).toFixed(4)}%`);
  }
  if (unprotected) minimumAmountOut = 0;

  if (!flag("yes") && !flag("simulate")) {
    console.log("\nAdd --simulate to dry-run, --yes to send.");
    return;
  }

  const transaction = partial
    ? await buildPartialFillSwapTransaction({
        snapshot,
        owner: payer.publicKey,
        side,
        amountIn,
        minimumAmountOut,
        allowZeroMinimum: unprotected,
      })
    : await buildSwapTransaction({
        snapshot,
        owner: payer.publicKey,
        side,
        amountIn,
        minimumAmountOut,
      });

  if (flag("simulate")) {
    const sim = await simulateTransaction({ transaction, payer: payer.publicKey });
    console.log(`\nsimulate       ${sim.ok ? "OK" : `FAILED ${JSON.stringify(sim.err)}`} · ${sim.unitsConsumed} CU`);
    for (const line of sim.logs.filter((l) => /Instruction: Swap|failed|error|Slippage/i.test(l))) {
      console.log(`  ${line}`);
    }
    if (!sim.ok) process.exit(1);
    return;
  }

  const signature = await sendTransaction({
    transaction,
    payer: payer.publicKey,
    signTransaction: keypairSigner(payer),
    onSent: (sig) => console.log(`\nsent           ${sig}`),
  });

  // The snapshot cache would otherwise hand back the pre-trade read.
  invalidatePoolSnapshot(poolAddress);
  const after = await fetchPoolSnapshot(poolAddress);
  console.log(`\n✅ Trade confirmed`);
  console.log(`tx             ${explorer.tx(signature)}`);
  console.log(`curve progress ${(snapshot.curve.progress * 100).toFixed(4)}% → ${((after?.curve.progress ?? 0) * 100).toFixed(4)}%`);
  console.log(`price          ${snapshot.price} → ${after?.price}`);
}

main().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
