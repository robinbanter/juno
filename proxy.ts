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

/**
 * Routes whose slug must be a Solana address, and the shape one has.
 *
 * A coin is keyed by its mint and a creator by their wallet, so anything that
 * is not base58 in the right length cannot exist — no lookup required to know
 * it.
 */
const ADDRESS_ROUTES = [/^\/coin\/([^/]+)/, /^\/creator\/([^/]+)/];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Give a malformed address a real 404 status.
 *
 * Next streams every one of these routes — a Server Component suspending
 * under `Suspense` starts the response body — and once the body is streaming
 * the status is already sent, so a `notFound()` in the page renders the right
 * UI over a 200. That is Next's documented behaviour, and it handles crawlers
 * by injecting `<meta name="robots" content="noindex">`; the docs name the
 * proxy as the place to run the check if a real status is wanted.
 *
 * Only the *shape* is checked here, deliberately. The same docs say to keep
 * proxy checks fast and not to fetch content in them, so a well-formed address
 * that simply is not in the registry still resolves to the streamed soft 404 —
 * that one needs a database read, and the page is the right place for it.
 */
function malformedAddress(pathname: string): boolean {
  for (const route of ADDRESS_ROUTES) {
    const slug = route.exec(pathname)?.[1];
    if (slug !== undefined) return !BASE58.test(decodeURIComponent(slug));
  }
  return false;
}

/**
 * Where a page request goes when this deployment is Juno's API.
 *
 * This Next app still carries the product it grew out of — Norr, an 18+
 * Algorand site — and on the Railway domain that was the home page: anyone
 * who trimmed a share link or followed one landed on an age gate for a
 * different product on a different chain. With `JUNO_APP_URL` set, every
 * page request is sent to the Juno app instead, at the matching screen where
 * there is one. `/api/*` is untouched — it is what the app calls.
 */
function junoAppRedirect(req: NextRequest): NextResponse | null {
  const app = process.env.JUNO_APP_URL?.replace(/\/$/, "");
  const { pathname } = req.nextUrl;
  if (!app || pathname.startsWith("/api/")) return null;

  const coin = /^\/coin\/([^/]+)/.exec(pathname);
  const creator = /^\/creator\/([^/]+)/.exec(pathname);
  const target = coin
    ? `/coin/${coin[1]}`
    : creator
      ? `/trader/${creator[1]}`
      : pathname === "/reels"
        ? "/reels"
        : pathname === "/explore"
          ? "/trade?sort=memes"
          : "/";
  return NextResponse.redirect(`${app}${target}`, 307);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const toApp = junoAppRedirect(req);
  if (toApp) return toApp;

  if (malformedAddress(pathname)) {
    return NextResponse.rewrite(new URL("/not-found", req.url), { status: 404 });
  }

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
