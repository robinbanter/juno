import { NextResponse } from "next/server";

import { clientKey } from "@/lib/juno/request";
import {
  issueSession,
  SESSION_COOKIE,
  sessionsConfigured,
  sessionWallet,
  verifySignIn,
} from "@/lib/juno/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    → { wallet } the browser is signed in as, or null
 * POST   { wallet, message, signature (base64) } → sets the session cookie
 * DELETE → signs out
 *
 * See `lib/juno/siws.ts` for why social writes need this.
 */
export async function GET(request: Request) {
  return NextResponse.json({
    wallet: sessionWallet(request),
    configured: sessionsConfigured(),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(`session:${clientKey(request)}`, LIMITS.signIn);
  if (limited) return limited;

  if (!sessionsConfigured()) {
    return NextResponse.json(
      { error: "Wallet sign-in is not configured on this server" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  let signature: Uint8Array;
  try {
    signature = Uint8Array.from(Buffer.from(str("signature"), "base64"));
  } catch {
    return NextResponse.json({ error: "Malformed signature" }, { status: 400 });
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const result = verifySignIn({
    wallet: str("wallet"),
    message: str("message"),
    signature,
    host,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 401 });

  const { token, maxAgeSeconds } = issueSession(result.wallet);
  const response = NextResponse.json({ wallet: result.wallet });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ wallet: null });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
