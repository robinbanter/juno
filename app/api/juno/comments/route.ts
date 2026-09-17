import { NextResponse } from "next/server";

import { cluster } from "@/lib/juno/cluster";
import { getPool } from "@/lib/juno/registry";
import { addComment, listComments, MAX_COMMENT } from "@/lib/juno/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("coin") ?? "";
  if (!BASE58.test(mint)) {
    return NextResponse.json({ error: "coin is not an address" }, { status: 400 });
  }
  return NextResponse.json({ comments: await listComments(mint, cluster()) });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const coinMint = str("coin");
  const wallet = str("wallet");
  const text = str("body").trim();

  if (!BASE58.test(coinMint)) {
    return NextResponse.json({ error: "coin is not an address" }, { status: 400 });
  }
  if (!BASE58.test(wallet)) {
    return NextResponse.json({ error: "wallet is not an address" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Comment is empty" }, { status: 400 });
  }
  if (text.length > MAX_COMMENT) {
    return NextResponse.json(
      { error: `Comment is over ${MAX_COMMENT} characters` },
      { status: 400 },
    );
  }

  // Only coins Juno actually launched can be commented on; otherwise this is
  // an open write endpoint keyed on an arbitrary string.
  const pool = await getPool(coinMint);
  if (!pool) {
    return NextResponse.json({ error: "No such coin" }, { status: 404 });
  }

  const side = str("side");
  const comment = await addComment({
    coinMint,
    cluster: cluster(),
    wallet,
    body: text,
    side: side === "buy" || side === "sell" ? side : undefined,
    signature: str("signature") || undefined,
  });

  return NextResponse.json({ comment }, { status: 201 });
}
