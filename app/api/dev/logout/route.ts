import { NextResponse } from "next/server";
import { DEV_AUTH_COOKIE, devAuthCookieOptions, isDevAuthEnabled } from "@/lib/dev-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDevAuthEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEV_AUTH_COOKIE, "", {
    ...devAuthCookieOptions(),
    maxAge: 0,
  });
  return res;
}
