import { describe, it, expect } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";

import { buildLaunch, buildSwap, submitSigned } from "@/lib/juno/tx";
import { fetchPoolSnapshot, getConnection, WSOL } from "@/lib/juno/dbc";
import { listPools } from "@/lib/juno/registry";
import { cluster } from "@/lib/juno/cluster";

/**
 * The transactions the mobile app will sign, signed here.
 *
 * This is the test PLAN.md calls non-negotiable, and it is worth saying why.
 * The mobile client never builds a Solana transaction — it asks this server for
 * bytes, signs them on the device, and sends them back. If those bytes are not
 * signable and landable, then every screen built on top of them is a
 * demonstration of a thing that does not work. So this suite signs them with a
 * local key exactly as the phone will, submits them, and requires a real
 * signature back from the cluster.
 *
 * The signing key is the devnet launcher at `.juno/launcher.json`. Tests that
 * actually move funds skip themselves when it is missing or empty rather than
 * failing, so the suite stays green on a fresh clone — but they never pretend
 * to have passed.
 */

const KEY_PATH = ".juno/launcher.json";

function launcher(): Keypair | null {
  if (!existsSync(KEY_PATH)) return null;
  try {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(KEY_PATH, "utf8")) as number[]),
    );
  } catch {
    return null;
  }
}

const payer = launcher();
const onDevnet = cluster() === "devnet";

/** Enough to pay fees and buy something small. */
const MIN_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

/**
 * "The endpoint refused" is not "the code is broken".
 *
 * These tests run against the public devnet RPC, which answers a burst with
 * 429s. Letting that fail the suite makes it red for a reason that has nothing
 * to do with the transactions being built, and people stop reading red. Letting
 * it pass silently is worse. So a refusal is reported as inconclusive, loudly,
 * and every other error still fails.
 */
function throttled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit|too many requests/i.test(message);
}

/** Runs `body`, or says out loud that the endpoint would not let it run. */
async function unlessThrottled(what: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    if (!throttled(error)) throw error;
    console.warn(`INCONCLUSIVE — ${what}: the devnet RPC is rate-limiting. Re-run in a minute.`);
  }
}

async function fundedPayer(): Promise<Keypair | null> {
  if (!payer || !onDevnet) return null;
  const balance = await getConnection().getBalance(payer.publicKey);
  return balance >= MIN_LAMPORTS ? payer : null;
}

/**
 * A SOL-quoted pool that can actually be traded right now.
 *
 * Graduation has to be checked, not assumed. The newest SOL-quoted pool in the
 * registry is a migrated one, and picking it made the real-buy test below take
 * its "pool graduated" early return and report success without ever submitting
 * a transaction — a green test that proved nothing at all.
 */
async function tradablePool() {
  const pools = await listPools(40);
  for (const row of pools) {
    if (row.quoteMint !== WSOL.mint) continue;
    const snapshot = await fetchPoolSnapshot(row.poolAddress);
    if (snapshot && !snapshot.curve.graduated) return row;
  }
  return null;
}

describe("juno tx: transactions built on the server", () => {
  it("builds a swap the client can sign, with a quote and a blockhash window", async () => {
    await unlessThrottled("builds a swap the client can sign, with a quote and a blockhash window", async () => {
      const pool = await tradablePool();
      expect(pool, "no tradable SOL-quoted pool in the registry for this cluster").not.toBeNull();
      if (!pool) return;

      const owner = payer?.publicKey.toBase58() ?? Keypair.generate().publicKey.toBase58();
      const built = await buildSwap({
        mint: pool.baseMint,
        poolAddress: pool.poolAddress,
        side: "buy",
        amountIn: 0.01,
        owner,
      }).catch((error: Error) => error);

      // A graduated pool is a legitimate outcome and must be a clear refusal
      // rather than an unsignable transaction.
      if (built instanceof Error) {
        expect(built.message).toMatch(/graduated|not found/i);
        return;
      }

      expect(built.unsigned.bytes).toBeGreaterThan(0);
      // Under the packet limit, or it could never be sent.
      expect(built.unsigned.bytes).toBeLessThanOrEqual(1232);
      expect(built.window.blockhash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(built.window.lastValidBlockHeight).toBeGreaterThan(0);
      expect(built.quote.amountOut).toBeGreaterThan(0);
      expect(built.quote.minimumAmountOut).toBeLessThanOrEqual(built.quote.amountOut);
      expect(built.quoteSymbol).toBe("SOL");

      // It must deserialise, name the right payer, and still be missing exactly
      // the signature the device is there to add.
      const tx = Transaction.from(Buffer.from(built.unsigned.transaction, "base64"));
      expect(tx.feePayer?.toBase58()).toBe(owner);
      expect(tx.recentBlockhash).toBe(built.window.blockhash);
      expect(tx.verifySignatures()).toBe(false);
    });
  }, 120_000);

  it("refuses a zero or negative amount instead of building something unsendable", async () => {
    await unlessThrottled("refuses a zero or negative amount instead of building something unsendable", async () => {
      const pool = await tradablePool();
      if (!pool) return;
      const owner = Keypair.generate().publicKey.toBase58();

      for (const amountIn of [0, -1, Number.NaN]) {
        await expect(
          buildSwap({
            mint: pool.baseMint,
            poolAddress: pool.poolAddress,
            side: "buy",
            amountIn,
            owner,
          }),
        ).rejects.toThrow(/greater than zero/i);
      }
    });
  }, 120_000);

  it("builds a launch as two packet-sized transactions, pre-signed by the new accounts", async () => {
    await unlessThrottled("builds a launch as two packet-sized transactions, pre-signed by the new accounts", async () => {
      const creator = (payer ?? Keypair.generate()).publicKey.toBase58();

      const built = await buildLaunch({
        creator,
        name: "Juno Signing Probe",
        symbol: "PROBE",
        uri: "",
        preset: "content",
        quoteMint: WSOL.mint,
      });

      // The two-transaction split is forced: a sixteen-segment curve bundled with
      // the pool init serialises past Solana's limit. Both halves must fit.
      expect(built.steps).toHaveLength(2);
      for (const step of built.steps) {
        expect(step.bytes).toBeLessThanOrEqual(1232);
        expect(step.bytes).toBeGreaterThan(0);
      }

      expect(built.config).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(built.baseMint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(built.pool).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

      // Each step should already carry its new account's signature, and still be
      // missing the payer's — otherwise the device has nothing to add, or too
      // much to add.
      for (const step of built.steps) {
        const tx = Transaction.from(Buffer.from(step.transaction, "base64"));
        expect(tx.feePayer?.toBase58()).toBe(creator);
        expect(tx.recentBlockhash).toBe(built.window.blockhash);
        const signed = tx.signatures.filter((s) => s.signature !== null);
        expect(signed.length).toBeGreaterThanOrEqual(1);
        expect(tx.verifySignatures()).toBe(false);
      }
    });
  }, 120_000);

  it("lands a real devnet buy from server-built bytes signed locally", async () => {
    await unlessThrottled("lands a real devnet buy from server-built bytes signed locally", async () => {
      const signer = await fundedPayer();
      if (!signer) {
        // Nothing to prove without funds, and inventing a pass would defeat the
        // only test that shows the mobile money path works.
        console.warn("skipped: .juno/launcher.json missing or under 0.05 SOL on devnet");
        return;
      }

      /*
       * Every exit from here has to be loud.
       *
       * This test already reported success once without submitting anything:
       * `tradablePool()` picked a migrated pool, `buildSwap` threw "graduated",
       * and the early return counted as a pass. A green test that proves nothing
       * is worse than a red one, so each way out now either states what it
       * skipped or fails.
       */
      const pool = await tradablePool();
      expect(pool, "no tradable SOL-quoted pool on this cluster to buy into").not.toBeNull();

      const built = await buildSwap({
        mint: pool!.baseMint,
        poolAddress: pool!.poolAddress,
        side: "buy",
        amountIn: 0.005,
        owner: signer.publicKey.toBase58(),
      }).catch((error: Error) => error);

      // `tradablePool` already checked graduation, so a build that refuses here
      // is a real disagreement between the two and not something to swallow.
      expect(
        built instanceof Error ? built.message : null,
        "buildSwap refused a pool that reported itself ungraduated",
      ).toBeNull();
      if (built instanceof Error) return;

      // Exactly what the phone does: deserialise, sign, hand back.
      const tx = Transaction.from(Buffer.from(built.unsigned.transaction, "base64"));
      tx.partialSign(signer);
      expect(tx.verifySignatures()).toBe(true);

      const result = await submitSigned({
        transaction: tx.serialize().toString("base64"),
        window: built.window,
        poolAddress: pool!.poolAddress,
      });

      expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);

      // The cluster must agree it happened and that it succeeded.
      const confirmed = await getConnection().getTransaction(result.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      expect(confirmed).not.toBeNull();
      expect(confirmed!.meta?.err).toBeNull();
      console.info(
        `landed a real devnet buy: https://solscan.io/tx/${result.signature}?cluster=devnet`,
      );
    });
  }, 180_000);
});
