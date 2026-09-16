import { NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy-verify";
import {
  CLIENT_USER_COOKIE,
  SESSION_COOKIE,
  clientUserCookieOptions,
  encodeClientUser,
  sessionCookieOptions,
  signSession,
  type SessionPayload,
} from "@/lib/privy-session";

interface LoginBody {
  token?: string;
  address?: string | null;
  profile?: { name?: string | null; email?: string | null; image?: string | null };
}

/** Establish the Norr session from a verified Privy access token. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as LoginBody | null;
  const token = body?.token;
  if (!token) {
    return NextResponse.json({ error: "Missing Privy token" }, { status: 400 });
  }

  const verified = await verifyPrivyToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid Privy token" }, { status: 401 });
  }

  const payload: SessionPayload = {
    sub: verified.userId,
    addr: body?.address ?? null,
    name: body?.profile?.name ?? null,
    email: body?.profile?.email ?? null,
    img: body?.profile?.image ?? null,
    iat: Date.now(),
  };

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(payload), sessionCookieOptions());
  res.cookies.set(CLIENT_USER_COOKIE, encodeClientUser(payload), clientUserCookieOptions());
  return res;
}

/** Clear the Norr session (logout). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  res.cookies.set(CLIENT_USER_COOKIE, "", { ...clientUserCookieOptions(), maxAge: 0 });
  return res;
}
