import "server-only";

import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

import { parseSignInMessage, SIGN_IN_TTL_MS } from "./siws";

/**
 * Wallet sessions: proof that the caller controls the wallet they act as.
 *
 * A session is issued once the wallet has signed a `siws.ts` message, and it
 * is a stateless HMAC token in an httpOnly cookie. There is no session table:
 * the only claim it carries is "this browser proved control of wallet W until
 * T", and that fits in a signed string.
 */

export const SESSION_COOKIE = "juno_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  const value = process.env.SESSION_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

/** False when no secret is configured, in which case social writes are refused. */
export function sessionsConfigured(): boolean {
  return secret() !== null;
}

function mac(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueSession(wallet: string): { token: string; maxAgeSeconds: number } {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  const payload = Buffer.from(
    JSON.stringify({ w: wallet, exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return { token: `${payload}.${mac(payload, key)}`, maxAgeSeconds: SESSION_TTL_MS / 1000 };
}

/** The wallet a session token proves, or null if it is missing, forged or expired. */
export function readSession(token: string | undefined): string | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { w, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      w: string;
      exp: number;
    };
    return typeof w === "string" && typeof exp === "number" && exp > Date.now() ? w : null;
  } catch {
    return null;
  }
}

/** The wallet this request is signed in as, from its cookie. */
export function sessionWallet(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return readSession(match?.[1]);
}

/** Ed25519 over raw bytes, with Node's own implementation — no extra dependency. */
function verifyEd25519(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  // SPKI DER prefix for an Ed25519 public key; the raw 32 bytes follow it.
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKey]);
  const key = createPublicKey({ key: der, format: "der", type: "spki" });
  return verify(null, message, key, signature);
}

/**
 * Check a signed sign-in message. Returns the wallet on success, or a reason.
 *
 * `host` is the host the request arrived on. The message names the domain it
 * was signed for, and a signature collected by some other site must not open
 * a session here.
 */
export function verifySignIn(params: {
  wallet: string;
  message: string;
  signature: Uint8Array;
  host: string;
}): { ok: true; wallet: string } | { ok: false; reason: string } {
  const parsed = parseSignInMessage(params.message);
  if (!parsed) return { ok: false, reason: "Not a Juno sign-in message" };
  if (parsed.wallet !== params.wallet) return { ok: false, reason: "Message is for another wallet" };
  if (parsed.domain !== params.host) return { ok: false, reason: "Message was signed for another site" };

  const issued = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > SIGN_IN_TTL_MS) {
    return { ok: false, reason: "Sign-in message has expired" };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = new PublicKey(params.wallet).toBytes();
  } catch {
    return { ok: false, reason: "wallet is not an address" };
  }
  if (params.signature.length !== 64) return { ok: false, reason: "Malformed signature" };

  const valid = verifyEd25519(new TextEncoder().encode(params.message), params.signature, publicKey);
  return valid ? { ok: true, wallet: params.wallet } : { ok: false, reason: "Signature does not match" };
}

/**
 * The guard every social write runs: the body's wallet must be the session's.
 * Returns a Response to send back, or null when the caller may proceed.
 */
export function requireWallet(request: Request, wallet: string): Response | null {
  if (!sessionsConfigured()) {
    return Response.json({ error: "Wallet sign-in is not configured on this server" }, { status: 503 });
  }
  const signedIn = sessionWallet(request);
  if (!signedIn) {
    return Response.json({ error: "Sign in with your wallet first" }, { status: 401 });
  }
  if (signedIn !== wallet) {
    return Response.json({ error: "Signed in as a different wallet" }, { status: 403 });
  }
  return null;
}
