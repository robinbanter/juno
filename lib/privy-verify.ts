/**
 * Verifies a Privy access token (JWT) against Privy's public JWKS. No app secret
 * needed — the JWKS is public, and jose caches it. Runs in Node route handlers.
 *
 * Privy access-token claims: `iss: "privy.io"`, `aud: <appId>`, `sub: <did>`.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

const jwks = appId
  ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`))
  : null;

export interface PrivyClaims {
  userId: string;
}

/**
 * Returns the verified Privy DID, or null if the token is invalid.
 *
 * When NEXT_PUBLIC_PRIVY_APP_ID is unset we can't verify. In development we fall
 * back to an UNVERIFIED decode of the token so local flows still work; in
 * production this returns null (login is rejected).
 */
export async function verifyPrivyToken(token: string): Promise<PrivyClaims | null> {
  if (jwks && appId) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: "privy.io",
        audience: appId,
      });
      if (typeof payload.sub === "string" && payload.sub) {
        return { userId: payload.sub };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    const sub = decodeSubUnverified(token);
    if (sub) return { userId: sub };
  }
  return null;
}

/** Decode a JWT payload without verifying the signature (dev fallback only). */
function decodeSubUnverified(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let s = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const claims = JSON.parse(atob(s)) as { sub?: string };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}
