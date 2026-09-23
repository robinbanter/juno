import "server-only";

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { CallerError } from "./api";
import { cluster } from "./cluster";
import { db } from "./social";

/**
 * Names for wallets.
 *
 * A social app where every person is "9CHr…WYoE" is a ledger with pictures.
 * A name is chosen once, proven by the wallet that owns it, and shown
 * wherever an address used to be. The address stays one tap away — on a
 * market, who someone is on-chain is the fact; the name is how you recognise
 * them.
 *
 * A name is claimed by signing a short message with the wallet's key, so no
 * one can rename someone else and there is no password to lose. Names are
 * unique case-insensitively per cluster.
 */
type ProfileDoc = { wallet: string; cluster: string; name: string; nameKey: string; updatedAt: Date };

const NAME = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(["juno", "admin", "support", "official", "meteora", "tessera", "pyth", "solana"]);
/** How old a signed request may be. Long enough for a slow phone, short enough not to replay. */
const MAX_AGE_MS = 5 * 60_000;

async function profiles() {
  const collection = (await db()).collection<ProfileDoc>("profiles");
  await Promise.all([
    collection.createIndex({ cluster: 1, wallet: 1 }, { unique: true }),
    collection.createIndex({ cluster: 1, nameKey: 1 }, { unique: true }),
  ]).catch(() => undefined);
  return collection;
}

/** The exact text a wallet signs to claim a name. Shared with the app. */
export function nameMessage(wallet: string, name: string, issuedAt: string): string {
  return `Juno name: ${name}\nWallet: ${wallet}\nIssued: ${issuedAt}`;
}

export async function namesFor(wallets: string[]): Promise<Record<string, string>> {
  if (wallets.length === 0) return {};
  const rows = await (await profiles())
    .find({ cluster: cluster(), wallet: { $in: wallets } }, { projection: { wallet: 1, name: 1 } })
    .toArray();
  return Object.fromEntries(rows.map((row) => [row.wallet, row.name]));
}

export async function claimName(input: {
  wallet: string;
  name: string;
  issuedAt: string;
  signature: string;
}): Promise<{ wallet: string; name: string }> {
  const name = input.name.trim();
  const key = name.toLowerCase();
  if (!NAME.test(key)) {
    throw new CallerError("Names are 3–20 characters: letters, digits and underscores.");
  }
  if (RESERVED.has(key)) throw new CallerError("That name is reserved.");

  let owner: PublicKey;
  try {
    owner = new PublicKey(input.wallet);
  } catch {
    throw new CallerError("wallet is not an address");
  }

  const issued = Date.parse(input.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > MAX_AGE_MS) {
    throw new CallerError("That request has expired. Try again.");
  }

  let signature: Uint8Array;
  try {
    signature = bs58.decode(input.signature);
  } catch {
    throw new CallerError("The signature is not valid.");
  }
  const message = new TextEncoder().encode(nameMessage(input.wallet, name, input.issuedAt));
  if (!nacl.sign.detached.verify(message, signature, owner.toBytes())) {
    throw new CallerError("The signature does not match this wallet.");
  }

  const collection = await profiles();
  try {
    await collection.updateOne(
      { cluster: cluster(), wallet: input.wallet },
      { $set: { name, nameKey: key, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new CallerError("That name is taken.");
    throw error;
  }
  return { wallet: input.wallet, name };
}
