import { NextResponse } from "next/server";

import { cluster } from "@/lib/juno/cluster";
import { getPool } from "@/lib/juno/registry";
import { likeState, toggleLike } from "@/lib/juno/social";
import { requireWallet } from "@/lib/juno/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET  ?coin=<mint>[&wallet=<pubkey>]  → { count, liked }
 * POST { coin, wallet }                → { count, liked } after toggling
 *
 * `wallet` is optional on GET on purpose: a visitor with no wallet connected
 * still gets the real count, with `liked: false` meaning "not you" rather than
 * "we don't know". That is what lets the UI show a truthful number while
 * disabling the action, instead of hiding the count or faking a like.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const coin = params.get("coin") ?? "";
  const wallet = params.get("wallet") ?? "";

  if (!BASE58.test(coin)) {
    return NextResponse.json({ error: "coin is not an address" }, { status: 400 });
  }

  return NextResponse.json(
    await likeState(coin, cluster(), BASE58.test(wallet) ? wallet : null),
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const coin = str("coin");
  const wallet = str("wallet");

  if (!BASE58.test(coin)) {
    return NextResponse.json({ error: "coin is not an address" }, { status: 400 });
  }
  if (!BASE58.test(wallet)) {
    return NextResponse.json({ error: "wallet is not an address" }, { status: 400 });
  }

  // The wallet must be the one this browser signed in as. Without this, any
  // caller could like as any address by naming it in the body.
  const denied = requireWallet(request, wallet);
  if (denied) return denied;
  const limited = rateLimit(`social:${wallet}`, LIMITS.socialWrite);
  if (limited) return limited;

  // Same guard the comments route applies: only coins Juno actually launched,
  // otherwise this is an open write endpoint keyed on an arbitrary string.
  if (!(await getPool(coin))) {
    return NextResponse.json({ error: "No such coin" }, { status: 404 });
  }

  return NextResponse.json(await toggleLike({ coinMint: coin, cluster: cluster(), wallet }));
}
