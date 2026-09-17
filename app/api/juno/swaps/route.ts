import { NextResponse } from "next/server";

import {
  change24hPct,
  listSwaps,
  pricePoints,
  totalVolume,
  volume24h,
} from "@/lib/juno/indexer";

/**
 * A pool's swap history, for the client.
 *
 * Why this is a route and not a server component read: the RPC quota this
 * depends on is spent per transaction fetched, and a pool with a dozen trades
 * is a dozen sequential calls. Doing that inside the page render blocks paint
 * on an endpoint that may simply refuse, and doing it for every tile on
 * `/explore` at once guarantees it will. Fetching after paint means the page
 * is fast, each pool is asked for once, and a refusal degrades to the same
 * em-dash the UI already shows rather than taking the page with it.
 *
 * `lib/juno/indexer.ts` caches per pool in-process and de-duplicates
 * concurrent reads, so N tiles asking at once is still one read per pool.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pool = params.get("pool") ?? "";
  const mint = params.get("mint") ?? "";

  if (!BASE58.test(pool) || !BASE58.test(mint)) {
    return NextResponse.json(
      { error: "pool and mint must both be addresses" },
      { status: 400 },
    );
  }

  const history = await listSwaps(pool, mint);

  // 503, not 200-with-nulls: the read failed, and the client should show the
  // same "still indexing" state it shows before the first fetch rather than
  // treating a refusal as an answer.
  if (history === null) {
    return NextResponse.json(
      { error: "swap history unavailable — the RPC refused the read" },
      { status: 503 },
    );
  }

  // Matches the indexer's own in-process TTL. Two components on the same page
  // ask for the same pool; this makes the second one a browser cache hit
  // rather than a second round trip.
  return NextResponse.json(
    {
      swaps: history.swaps,
      truncated: history.truncated,
      missed: history.missed,
      // All three are null whenever the window cannot support them. The client
      // renders null as an em-dash, never as a zero.
      volume24h: volume24h(history),
      totalVolume: totalVolume(history),
      change24hPct: change24hPct(history),
      points: pricePoints(history),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
