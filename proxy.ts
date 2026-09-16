import { NextResponse, type NextRequest } from "next/server";
import { DEV_AUTH_COOKIE, isValidDevAuthCookie } from "@/lib/dev-session";
import { SESSION_COOKIE, verifySession } from "@/lib/privy-session";

const PROTECTED = [
  /^\/new(\/|$)/,
  /^\/messages(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/profile(\/|$)/,
  /^\/add-funds(\/|$)/,
  /^\/withdraw(\/|$)/,
  /^\/records(\/|$)/,
  // Everything under /api/blur except the self-authenticating webhook + cron,
  // which PUBLIC_API exempts above (it is matched first).
  /^\/api\/blur(\/|$)/,
  /^\/api\/collection(\/|$)/,
  /^\/api\/comments(\/|$)/,
  /^\/api\/follow(\/|$)/,
  /^\/api\/loyalty(\/|$)/,
  /^\/api\/messages(\/|$)/,
  /^\/api\/posts(\/|$)/,
  /^\/api\/tip(\/|$)/,
  /^\/api\/unlock(\/|$)/,
  /^\/api\/user(\/|$)/,
];

const PUBLIC_API = [
  // ONLY the two blur endpoints that authenticate themselves: the Replicate
  // webhook (signature-verified) and the cron reconcile (CRON_SECRET). The rest
  // of /api/blur — ingest, approve, reject, retry, job reads — must NOT be here:
  // they create paid Replicate predictions and admit media to the platform, so
  // exposing them let anyone burn credit and approve their own uploads.
  /^\/api\/blur\/webhook(\/|$)/,
  /^\/api\/blur\/reconcile(\/|$)/,
  /^\/api\/og(\/|$)/,
  /^\/api\/auth(\/|$)/,
  // Uptime monitors must reach this without a session.
  /^\/api\/health(\/|$)/,
  // Reporting abuse must not require an account — see app/api/reports.
  /^\/api\/reports(\/|$)/,
  // Moderation authenticates with an operator bearer secret, not a session
  // cookie, and fails closed on its own (lib/moderation-auth).
  /^\/api\/moderation(\/|$)/,
  // x402 resources authenticate with a signed payment, not a session cookie —
  // requiring a login would defeat the point of a machine-payable endpoint.
  /^\/api\/x402(\/|$)/,
];

const matches = (list: RegExp[], path: string) => list.some((re) => re.test(path));

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (matches(PUBLIC_API, pathname)) return NextResponse.next();
  if (!matches(PROTECTED, pathname)) return NextResponse.next();

  // Dev-auth bypass (development only), mirrors the legacy behavior.
  if (isValidDevAuthCookie(req.cookies.get(DEV_AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  // Unauthenticated: JSON 401 for APIs, redirect to sign-in for pages.
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
