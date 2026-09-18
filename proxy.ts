import { NextResponse, type NextRequest } from "next/server";

/**
 * Real 404s for addresses that cannot possibly exist.
 *
 * Why this lives here and not in the pages: `app/(juno)/loading.tsx` streams a
 * skeleton the moment a Juno route starts rendering, and once streaming starts
 * the `200 OK` is already on the wire. A `notFound()` inside the page can then
 * only render the not-found UI and inject `<meta name="robots"
 * content="noindex">` — it cannot change the status. Proxy runs before any of
 * that, so the status is still ours to set.
 *
 * Only a structural check is done here — is this even a base58 public key? —
 * because it costs nothing. Whether a *well-formed* mint is actually a Juno
 * coin needs a database lookup, and Proxy is not the place for data fetching:
 * it would put a Postgres round trip in front of every coin page view and make
 * a database outage fail pages it has no business failing. Well-formed unknown
 * addresses therefore still render the not-found page with HTTP 200 plus the
 * framework's noindex meta, which is the documented behaviour for streamed
 * routes and keeps them out of search indexes.
 */

// Solana public keys: base58, 32–44 characters. Excludes 0, O, I and l.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function proxy(request: NextRequest) {
  // "/coin/<id>" -> ["", "coin", "<id>"]; the matcher guarantees the section.
  const [, , id, ...rest] = request.nextUrl.pathname.split("/");

  // Only the bare /coin/<id> and /creator/<id> pages. Anything deeper is not
  // a route that exists and falls through to Next's own 404.
  if (rest.length === 0 && id && !BASE58.test(decodeURIComponent(id))) {
    // Rewriting to a path no route matches makes Next render app/not-found.tsx
    // with a genuine 404, rather than a bare-text response.
    return NextResponse.rewrite(new URL("/__not-found", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/coin/:id", "/creator/:id"],
};
