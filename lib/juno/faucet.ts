import "server-only";

import { Keypair } from "@solana/web3.js";

import { decryptSecretKey, encryptSecretKey } from "@/lib/custodial-keys";
import { cluster } from "./cluster";
import { db } from "./social";

/**
 * Juno's own devnet faucet key: created by the server, sealed at rest, and
 * never seen by a person.
 *
 * Solana's public faucet is rate-limited and often dry, and a visitor with
 * zero SOL can do nothing in Juno — not buy, not launch. So the server holds
 * a key of its own and tops wallets up from it. It is generated here the
 * first time it is needed and stored in Mongo sealed with the same AES-GCM
 * key that protects custodial wallets (`CUSTODIAL_KEY_ENCRYPTION_SECRET`),
 * which means no one has to paste a private key into a dashboard to make the
 * faucet work: fund its public address and it runs.
 *
 * One key per cluster, keyed by document id so two instances racing to
 * create it cannot end up with two.
 */
type FaucetDoc = {
  _id: string;
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  createdAt: Date;
};

let cached: Keypair | null = null;

export async function faucetKeypair(): Promise<Keypair> {
  if (cached) return cached;
  const collection = (await db()).collection<FaucetDoc>("system");
  const id = `faucet:${cluster()}`;

  let doc = await collection.findOne({ _id: id });
  if (!doc) {
    const fresh = Keypair.generate();
    const sealed = encryptSecretKey(fresh.secretKey);
    try {
      await collection.insertOne({
        _id: id,
        publicKey: fresh.publicKey.toBase58(),
        ...sealed,
        createdAt: new Date(),
      });
    } catch {
      // Another instance won the race; use theirs.
    }
    doc = await collection.findOne({ _id: id });
    if (!doc) throw new Error("The faucet key could not be stored");
  }

  cached = Keypair.fromSecretKey(decryptSecretKey(doc));
  if (cached.publicKey.toBase58() !== doc.publicKey) {
    cached = null;
    throw new Error("The faucet key does not match its recorded address");
  }
  return cached;
}
