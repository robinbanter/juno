import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";

// Every refusal below happens before the database is touched. If one ever
// reaches it, this makes the test fail loudly instead of silently writing.
vi.mock("../../lib/juno/social", () => ({
  db: () => {
    throw new Error("reached the database");
  },
}));

import { claimName, nameMessage } from "../../lib/juno/profiles";

/**
 * Claiming a name.
 *
 * A name is the thing people recognise someone by, so the only way to set one
 * is to sign for it with the wallet's key. These are the ways a claim must be
 * refused — each is a way someone could take a name that is not theirs.
 */
function signed(keypair: Keypair, name: string, issuedAt = new Date().toISOString()) {
  const wallet = keypair.publicKey.toBase58();
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(nameMessage(wallet, name, issuedAt)), keypair.secretKey),
  );
  return { wallet, name, issuedAt, signature };
}

describe("claimName", () => {
  it("refuses a signature from a different wallet", async () => {
    const owner = Keypair.generate();
    const thief = Keypair.generate();
    const forged = { ...signed(thief, "alice"), wallet: owner.publicKey.toBase58() };
    await expect(claimName(forged)).rejects.toThrow(/does not match this wallet/);
  });

  it("refuses a signature over a different name", async () => {
    const owner = Keypair.generate();
    const claim = { ...signed(owner, "alice"), name: "bob" };
    await expect(claimName(claim)).rejects.toThrow(/does not match this wallet/);
  });

  it("refuses a request signed too long ago, so a signature cannot be replayed", async () => {
    const owner = Keypair.generate();
    const stale = signed(owner, "alice", new Date(Date.now() - 10 * 60_000).toISOString());
    await expect(claimName(stale)).rejects.toThrow(/expired/);
  });

  it("refuses names outside 3–20 letters, digits and underscores", async () => {
    const owner = Keypair.generate();
    for (const name of ["ab", "a".repeat(21), "has space", "emoji🙂", "dash-name"]) {
      await expect(claimName(signed(owner, name))).rejects.toThrow(/3–20 characters/);
    }
  });

  it("refuses reserved names, case-insensitively", async () => {
    const owner = Keypair.generate();
    await expect(claimName(signed(owner, "Juno"))).rejects.toThrow(/reserved/);
  });

  it("refuses a malformed wallet or signature", async () => {
    const owner = Keypair.generate();
    await expect(claimName({ ...signed(owner, "alice"), wallet: "nope" })).rejects.toThrow(/not an address/);
    await expect(claimName({ ...signed(owner, "alice"), signature: "0OIl" })).rejects.toThrow(/not valid/);
  });

  it("gets as far as storing a correctly signed claim", async () => {
    // The mocked database throws, which proves every check above passed.
    await expect(claimName(signed(Keypair.generate(), "alice_01"))).rejects.toThrow(/reached the database/);
  });
});
