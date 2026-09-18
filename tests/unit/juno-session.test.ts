import { createPrivateKey, sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSignInMessage, signInMessage } from "@/lib/juno/siws";
import { issueSession, readSession, verifySignIn } from "@/lib/juno/session";

const HOST = "juno.example";

function signer(keypair: Keypair) {
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(keypair.secretKey.slice(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  return (message: string) => new Uint8Array(sign(null, Buffer.from(message), key));
}

describe("sign-in message", () => {
  it("round-trips, and rejects any edited line", () => {
    const fields = { domain: HOST, wallet: Keypair.generate().publicKey.toBase58(), issuedAt: new Date().toISOString() };
    const message = signInMessage(fields);
    expect(parseSignInMessage(message)).toEqual(fields);
    expect(parseSignInMessage(message.replace("This is free", "This is cheap"))).toBeNull();
    expect(parseSignInMessage("hello")).toBeNull();
  });
});

describe("verifySignIn", () => {
  const keypair = Keypair.generate();
  const wallet = keypair.publicKey.toBase58();
  const sign = signer(keypair);
  const fresh = () => signInMessage({ domain: HOST, wallet, issuedAt: new Date().toISOString() });

  it("accepts the wallet's own signature over a fresh message for this host", () => {
    const message = fresh();
    expect(verifySignIn({ wallet, message, signature: sign(message), host: HOST })).toEqual({ ok: true, wallet });
  });

  it("rejects a signature by a different key", () => {
    const message = fresh();
    const impostor = signer(Keypair.generate());
    expect(verifySignIn({ wallet, message, signature: impostor(message), host: HOST }).ok).toBe(false);
  });

  it("rejects a message signed for another site", () => {
    const message = fresh();
    expect(verifySignIn({ wallet, message, signature: sign(message), host: "evil.example" })).toMatchObject({ ok: false });
  });

  it("rejects a stale message", () => {
    const message = signInMessage({ domain: HOST, wallet, issuedAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect(verifySignIn({ wallet, message, signature: sign(message), host: HOST })).toMatchObject({ ok: false });
  });

  it("rejects a message naming a different wallet than claimed", () => {
    const other = Keypair.generate().publicKey.toBase58();
    const message = fresh();
    expect(verifySignIn({ wallet: other, message, signature: sign(message), host: HOST }).ok).toBe(false);
  });
});

describe("session token", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads back the wallet it was issued for, and nothing once tampered", () => {
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    const wallet = Keypair.generate().publicKey.toBase58();
    const { token } = issueSession(wallet);
    expect(readSession(token)).toBe(wallet);

    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ w: "someone-else", exp: Date.now() + 1e9 })).toString("base64url");
    expect(readSession(`${forged}.${mac}`)).toBeNull();
    expect(readSession(`${payload}.${mac.slice(0, -2)}xx`)).toBeNull();
  });

  it("does not survive a change of secret", () => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(40));
    const { token } = issueSession(Keypair.generate().publicKey.toBase58());
    vi.stubEnv("SESSION_SECRET", "b".repeat(40));
    expect(readSession(token)).toBeNull();
  });

  it("refuses to issue without a real secret", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => issueSession(Keypair.generate().publicKey.toBase58())).toThrow();
  });
});
