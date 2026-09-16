/**
 * Prepare the platform account to run on real USDC.
 *
 * Norr has no treasury and mints nothing: users fund themselves by sending their
 * own USDC. The platform account only ever needs to
 *   1. hold ALGO, to pay gas and to seed fresh user wallets so they can opt in, and
 *   2. be opted in to USDC itself, so it can receive unlock revenue.
 *
 * This script reports (1) and performs (2). It replaces the old `asa:deploy`,
 * which minted a play-money ASA — there is nothing to deploy for real USDC.
 *
 *   npm run wallet:setup
 *
 * Set NEXT_PUBLIC_ALGO_NETWORK=mainnet to target MainNet. On MainNet the ALGO
 * this account spends is real; nothing here moves USDC.
 */
import algosdk from "algosdk";

const USDC = { mainnet: 31566704, testnet: 10458941 } as const;

const NETWORK =
  (process.env.NEXT_PUBLIC_ALGO_NETWORK ?? process.env.ALGO_NETWORK ?? "testnet").toLowerCase() ===
  "mainnet"
    ? "mainnet"
    : "testnet";

const ALGOD = {
  mainnet: "https://mainnet-api.algonode.cloud",
  testnet: "https://testnet-api.algonode.cloud",
} as const;

const EXPLORER = {
  mainnet: "https://explorer.perawallet.app",
  testnet: "https://testnet.explorer.perawallet.app",
} as const;

// 0.1 base min-balance + 0.1 per asset + fees. Below this the opt-in can't go through.
const MIN_ALGO_TO_OPT_IN = 250_000;
// Each new user wallet costs the platform ~0.3 ALGO to seed (gas only, refundable
// in the sense that it stays in the user's wallet).
const SEED_PER_USER_MICROALGOS = 300_000;

async function main() {
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) throw new Error("DEPLOYER_MNEMONIC is not set in .env.local");

  const assetId = USDC[NETWORK];
  const deployer = algosdk.mnemonicToSecretKey(mnemonic.trim());
  const addr = deployer.addr.toString();
  const server = process.env.ALGOD_SERVER ?? ALGOD[NETWORK];
  const port = process.env.ALGOD_PORT ? Number(process.env.ALGOD_PORT) : 443;
  const algod = new algosdk.Algodv2(process.env.ALGOD_TOKEN ?? "", server, port);

  console.log(`Network:  ${NETWORK}${NETWORK === "mainnet" ? "  ⚠️  REAL MONEY" : ""}`);
  console.log(`USDC:     ${assetId}`);
  console.log(`Platform: ${addr}`);

  const info = await algod.accountInformation(addr).do();
  const micro = Number(info.amount);
  console.log(`Balance:  ${(micro / 1e6).toFixed(6)} ALGO`);

  const optedIn = (info.assets ?? []).some((a) => Number(a.assetId) === assetId);
  if (optedIn) {
    const holding = (info.assets ?? []).find((a) => Number(a.assetId) === assetId);
    console.log(`\n✅ Already opted in to USDC — holding ${(Number(holding?.amount ?? 0) / 1e6).toFixed(2)} USDC`);
  } else {
    if (micro < MIN_ALGO_TO_OPT_IN) {
      const where =
        NETWORK === "testnet"
          ? "https://bank.testnet.algorand.network/"
          : "an exchange withdrawal to this address";
      throw new Error(
        `Platform needs at least ${(MIN_ALGO_TO_OPT_IN / 1e6).toFixed(2)} ALGO to opt in. Fund ${addr} via ${where} then re-run.`,
      );
    }

    console.log("\nOpting the platform in to USDC…");
    const sp = await algod.getTransactionParams().do();
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: addr,
      receiver: addr, // opt-in = a 0-amount self transfer
      amount: 0,
      assetIndex: assetId,
      suggestedParams: sp,
    });
    const { txid } = await algod.sendRawTransaction(txn.signTxn(deployer.sk)).do();
    await algosdk.waitForConfirmation(algod, txid, 8);
    console.log(`✅ Opted in — ${EXPLORER[NETWORK]}/tx/${txid}`);
  }

  // The one number an operator actually has to plan for.
  const seedable = Math.floor((micro - MIN_ALGO_TO_OPT_IN) / SEED_PER_USER_MICROALGOS);
  console.log(`\nGas budget: enough ALGO to seed ~${Math.max(seedable, 0)} new user wallet(s)`);
  console.log(`  (each new user costs the platform ~${(SEED_PER_USER_MICROALGOS / 1e6).toFixed(1)} ALGO in gas — no USDC)`);
  console.log(`\nPlatform: ${EXPLORER[NETWORK]}/address/${addr}`);
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
