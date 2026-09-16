import { NextResponse } from "next/server";

import { CURVE_PRESETS } from "@/lib/juno/curves";
import { getDbcClient } from "@/lib/juno/dbc";
import { listPools, recordLaunch } from "@/lib/juno/registry";
import type { CoinFormat, CurvePresetId } from "@/lib/juno/types";

export const runtime = "nodejs";
// The registry is a live index of on-chain state; a cached response would
// hide a launch that just confirmed.
export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET() {
  const rows = await listPools();
  return NextResponse.json({ pools: rows });
}

/**
 * Record a launch after its transactions have confirmed.
 *
 * The pool is re-read from chain before anything is written. Without that
 * check this endpoint would accept any JSON and the "index of real pools"
 * would be an index of claims.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  const baseMint = str("baseMint");
  const poolAddress = str("poolAddress");
  const configAddress = str("configAddress");
  const quoteMint = str("quoteMint");
  const creatorWallet = str("creatorWallet");
  const createSignature = str("createSignature");
  const name = str("name").trim();
  const symbol = str("symbol").trim();
  const curvePreset = str("curvePreset") as CurvePresetId;
  const format = (str("format") || "post") as CoinFormat;

  for (const [key, value] of Object.entries({
    baseMint,
    poolAddress,
    configAddress,
    quoteMint,
    creatorWallet,
  })) {
    if (!BASE58.test(value)) {
      return NextResponse.json({ error: `${key} is not an address` }, { status: 400 });
    }
  }
  if (!name || !symbol || !createSignature) {
    return NextResponse.json(
      { error: "name, symbol and createSignature are required" },
      { status: 400 },
    );
  }
  if (!CURVE_PRESETS[curvePreset]) {
    return NextResponse.json({ error: "Unknown curve preset" }, { status: 400 });
  }
  if (format !== "post" && format !== "reel") {
    return NextResponse.json({ error: "format must be post or reel" }, { status: 400 });
  }

  // The chain is the authority on whether this pool exists, and on who its
  // creator and base mint actually are. Trusting the client here would let a
  // caller attribute someone else's pool to themselves.
  const onChain = await getDbcClient().state.getPool(poolAddress);
  if (!onChain) {
    return NextResponse.json(
      { error: "No such pool on this cluster" },
      { status: 404 },
    );
  }
  const state = (onChain as unknown as {
    poolState: { baseMint: { toBase58(): string }; creator: { toBase58(): string }; config: { toBase58(): string } };
  }).poolState;

  if (state.baseMint.toBase58() !== baseMint) {
    return NextResponse.json({ error: "baseMint does not match the pool" }, { status: 400 });
  }
  if (state.creator.toBase58() !== creatorWallet) {
    return NextResponse.json({ error: "creatorWallet does not match the pool" }, { status: 400 });
  }
  if (state.config.toBase58() !== configAddress) {
    return NextResponse.json({ error: "configAddress does not match the pool" }, { status: 400 });
  }

  const row = await recordLaunch({
    baseMint,
    poolAddress,
    configAddress,
    quoteMint,
    creatorWallet,
    name,
    symbol,
    description: str("description") || null,
    format,
    curvePreset,
    navFeedId: str("navFeedId") || null,
    createSignature,
  });

  return NextResponse.json({ pool: row }, { status: 201 });
}
