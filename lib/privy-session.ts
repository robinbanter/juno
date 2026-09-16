/**
 * Norr session: a signed, HMAC-backed cookie that replaces Clerk as the app's
 * session of record. Issued by /api/auth/privy after a Privy access token is
 * verified, then trusted by the middleware (edge) and server code (node).
 *
 * Web Crypto only (no node:crypto, no Buffer) so the exact same helpers run in
 * the edge middleware and in Node route handlers.
 */

export const SESSION_COOKIE = "zorr_session";
/** Readable companion cookie: presence = signed-in on the client; holds a tiny profile. */
export const CLIENT_USER_COOKIE = "zorr_user";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  /** Privy DID (`did:privy:...`) — used as the stable `clerkId` for the DB user. */
  sub: string;
  /** Algorand address of the embedded wallet (null until provisioned). */
  addr: string | null;
  name: string | null;
  email: string | null;
  img: string | null;
  /** Issued-at, ms. */
  iat: number;
}

export interface ClientUser {
  name: string | null;
  email: string | null;
  addr: string | null;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value: string): Uint8Array {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Only ever used when NODE_ENV !== production — see getKey(). */
const DEV_ONLY_SECRET = "zorr-dev-insecure-secret-change-me";

async function getKey(): Promise<CryptoKey> {
  // A default keeps local dev config-free, but it MUST NOT survive into
  // production: this key signs the session cookie, and the fallback is a public
  // string in this repo. Anyone could forge a session for any user and drain the
  // custodial wallet behind it. Fail loudly instead of silently trusting it.
  const configured = process.env.SESSION_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. Refusing to sign sessions with the public dev fallback.",
    );
  }
  const secret = configured || DEV_ONLY_SECRET;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Returns `${base64url(payload)}.${base64url(hmac)}`. */
export async function signSession(payload: SessionPayload): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await getKey(), data));
  return `${bytesToB64url(data)}.${bytesToB64url(sig)}`;
}

/** Verifies the HMAC and returns the payload, or null if missing/tampered. */
export async function verifySession(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  try {
    const data = b64urlToBytes(value.slice(0, dot));
    const sig = b64urlToBytes(value.slice(dot + 1));
    const ok = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      sig as unknown as BufferSource,
      data as unknown as BufferSource,
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(data)) as SessionPayload;
  } catch {
    return null;
  }
}

export function encodeClientUser(payload: SessionPayload): string {
  const client: ClientUser = { name: payload.name, email: payload.email, addr: payload.addr };
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(client)));
}

/** Pure decode (no crypto) — safe to call on the client. */
export function decodeClientUser(value: string | undefined | null): ClientUser | null {
  if (!value) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(value))) as ClientUser;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function clientUserCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}
