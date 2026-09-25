/**
 * Give the demo markets real devnet trading, through the production API.
 *
 * A market nobody has traded has an empty chart, no holders and nothing under
 * "Bought by", which reads as a broken app rather than a quiet one. This makes
 * a handful of small buys (and one sell) from a few demo wallets, each named
 * `demo_…` so nobody mistakes them for users.
 *
 * Every trade goes the way the phone's does — the server builds the unsigned
 * transaction, the wallet signs locally, the server submits and records it —
 * so a clean run is also an end-to-end test of the deployed trade path.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/juno-demo-activity.ts [--api <url>]
 *
 * Devnet only: it refuses to run against a mainnet cluster.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API =
  process.argv.includes("--api")
    ? process.argv[process.argv.indexOf("--api") + 1]
    : "https://juno-web-production-bd2e.up.railway.app";

if (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta") {
  throw new Error("Demo activity is devnet only.");
}

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const COINS = {
  ZOOM: "3znz9AnsaaGYz9BKEUbDMAmjycFsxs7g6EkNX77bTh2F",
  NIGHTMKT: "AE9ZPMrarDC5uSQBphVfy4aZvLVZZ8jRQuNAt12bs9yo",
  FOUNDRY: "FszZzZFMmJqGC2Np5Yst6RtMc3MB6xmZHyyyfVjXcsM2",
  DEEPER: "J8rEUwsSnd5LKD2kbzeX3gUtdv5mjNuNRYQy5VdYYhjx",
  OPENAIX: "4BvmeTbEXzYJvhYQmiYNjG9DGVVFjfgpeCnXH57yKLea",
  KALSHIX: "4msUJ9WNZxKDEPKpmkvUbh18snvzYBgFEracLXwbc3aF",
  SPACEXX: "FFpJbMH35kLP6tB5LLnXJSZy6BKVtwcaFHTz98tDjTVY",
  TRANSIT: "2SjKAv6yU9qv8uSuCeCuhEF8NHyCZ3z9ZwBgthywEJk9",
  NVDAXI: "6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69",
} as const;

type Step = {
  coin: keyof typeof COINS;
  side: "buy" | "sell";
  /** SOL on a buy; on a sell, the share of what this wallet bought of it. */
  amount: number;
  note?: string;
};

const PLAN: Record<string, Step[]> = {
  demo_ana: [
    { coin: "ZOOM", side: "buy", amount: 0.02, note: "Early on this one." },
    { coin: "OPENAIX", side: "buy", amount: 0.03 },
    { coin: "NIGHTMKT", side: "buy", amount: 0.01 },
  ],
  demo_kai: [
    { coin: "KALSHIX", side: "buy", amount: 0.03, note: "Opening size on the Kalshi book." },
    { coin: "ZOOM", side: "buy", amount: 0.015 },
    { coin: "FOUNDRY", side: "buy", amount: 0.01 },
    { coin: "ZOOM", side: "sell", amount: 0.5 },
  ],
  demo_rio: [
    { coin: "SPACEXX", side: "buy", amount: 0.03 },
    { coin: "DEEPER", side: "buy", amount: 0.01 },
    { coin: "TRANSIT", side: "buy", amount: 0.01 },
  ],
  demo_lena: [
    { coin: "OPENAIX", side: "buy", amount: 0.02, note: "Tracking the mark nicely." },
    { coin: "NVDAXI", side: "buy", amount: 0.02 },
    { coin: "ZOOM", side: "buy", amount: 0.01 },
    { coin: "NIGHTMKT", side: "buy", amount: 0.01 },
  ],
};

const FUND_SOL = 0.1;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry what the public devnet RPC refuses; it answers bursts with 429s. */
async function patiently<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const message = (error as Error).message;
      const retryable = /rate-limit|429|blockhash not found|timed out|fetch failed/i.test(message);
      if (!retryable || attempt >= 6) throw error;
      console.log(`  ${label}: busy, retrying in ${attempt * 5}s`);
      await pause(attempt * 5_000);
    }
  }
}

/** Steps already on chain, so a re-run picks up where the last one stopped. */
const PROGRESS = path.resolve(".juno/demo/progress.json");
const done: Record<string, boolean> = existsSync(PROGRESS)
  ? JSON.parse(readFileSync(PROGRESS, "utf8"))
  : {};
function markDone(id: string) {
  done[id] = true;
  writeFileSync(PROGRESS, JSON.stringify(done, null, 2));
}

async function api<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${route}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(`${route}: ${json.error ?? response.status}`);
  return json;
}

function keyFor(name: string): Keypair {
  const file = path.resolve(".juno/demo", `${name}.json`);
  if (existsSync(file)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
  }
  const key = Keypair.generate();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify([...key.secretKey]), { mode: 0o600 });
  return key;
}

function sign(base64: string, key: Keypair): string {
  const transaction = Transaction.from(Buffer.from(base64, "base64"));
  transaction.partialSign(key);
  return transaction.serialize({ requireAllSignatures: false }).toString("base64");
}

async function main() {
  const launcher = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(".juno/launcher.json", "utf8"))),
  );
  const bought = new Map<string, number>();

  for (const [name, steps] of Object.entries(PLAN)) {
    const key = keyFor(name);
    const wallet = key.publicKey.toBase58();
    console.log(`\n${name}  ${wallet}`);

    const balance = (await connection.getBalance(key.publicKey)) / LAMPORTS_PER_SOL;
    if (balance < 0.06) {
      const fund = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: launcher.publicKey,
          toPubkey: key.publicKey,
          lamports: Math.round(FUND_SOL * LAMPORTS_PER_SOL),
        }),
      );
      await patiently("fund", () => sendAndConfirmTransaction(connection, fund, [launcher]));
      console.log(`  funded ${FUND_SOL} devnet SOL`);
    }

    // Names are claimed by signing a message, as the app does.
    const issuedAt = new Date().toISOString();
    const message = `Juno name: ${name}\nWallet: ${wallet}\nIssued: ${issuedAt}`;
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), key.secretKey),
    );
    await api("/api/juno/profiles", { wallet, name, issuedAt, signature })
      .then(() => console.log(`  named ${name}`))
      .catch((error: Error) => console.log(`  name: ${error.message}`));

    for (const [index, step] of steps.entries()) {
      const id = `${name}:${index}`;
      const mint = COINS[step.coin];
      if (done[id]) {
        console.log(`  ${step.side} ${step.coin} already done`);
        continue;
      }
      const held = bought.get(`${name}:${mint}`) ?? 0;
      const amountIn = step.side === "sell" ? Math.floor(held * step.amount) : step.amount;
      if (!(amountIn > 0)) continue;
      try {
        await pause(3_000);
        const built = await patiently(step.coin, () => api<{
          unsigned: { transaction: string };
          window: unknown;
          pool: string;
          quote: { amountOut: number };
        }>("/api/juno/tx/swap", { mint, owner: wallet, side: step.side, amountIn }));
        const { signature: landed } = await api<{ signature: string }>("/api/juno/tx/submit", {
          transaction: sign(built.unsigned.transaction, key),
          window: built.window,
          poolAddress: built.pool,
        });
        markDone(id);
        if (step.side === "buy") bought.set(`${name}:${mint}`, held + built.quote.amountOut);
        console.log(`  ${step.side} ${amountIn} ${step.coin}  ${landed.slice(0, 12)}…`);
        if (step.note) {
          await api("/api/juno/comments", {
            coin: mint,
            wallet,
            body: step.note,
            side: step.side,
            signature: landed,
          }).catch((error: Error) => console.log(`  note: ${error.message}`));
        }
      } catch (error) {
        console.log(`  ${step.side} ${step.coin} failed: ${(error as Error).message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
