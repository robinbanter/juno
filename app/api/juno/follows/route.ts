import { NextResponse } from "next/server";

import { followState, toggleFollow } from "@/lib/juno/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET  ?creator=<pubkey>[&viewer=<pubkey>]  → { followers, following, following_them }
 * POST { creator, viewer }                  → same, after toggling
 *
 * A creator is a wallet, so there is no coin to validate against the registry
 * the way likes and comments do. The guard that matters here is different: a
 * wallet cannot follow itself.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const creator = params.get("creator") ?? "";
  const viewer = params.get("viewer") ?? "";

  if (!BASE58.test(creator)) {
    return NextResponse.json({ error: "creator is not an address" }, { status: 400 });
  }

  return NextResponse.json(
    await followState(creator, BASE58.test(viewer) ? viewer : null),
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
  const creator = str("creator");
  const viewer = str("viewer");

  if (!BASE58.test(creator)) {
    return NextResponse.json({ error: "creator is not an address" }, { status: 400 });
  }
  if (!BASE58.test(viewer)) {
    return NextResponse.json({ error: "viewer is not an address" }, { status: 400 });
  }
  if (creator === viewer) {
    return NextResponse.json({ error: "A wallet cannot follow itself" }, { status: 400 });
  }

  return NextResponse.json(
    await toggleFollow({ followerWallet: viewer, creatorWallet: creator }),
  );
}
