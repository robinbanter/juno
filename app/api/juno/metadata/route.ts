import { NextResponse } from "next/server";

import { CURVE_PRESETS } from "@/lib/juno/curves";
import { pinTokenMetadata } from "@/lib/juno/pinata";
import type { CurvePresetId } from "@/lib/juno/types";

export const runtime = "nodejs";

/**
 * Pin the Metaplex metadata JSON a mint will point at.
 *
 * Called before the launch transaction, because the URI is baked into the mint
 * at creation and Juno's presets renounce update authority — there is no
 * second chance to attach it.
 */
export async function POST(request: Request) {
  if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: "Metadata pinning is not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const name = str("name").trim();
  const symbol = str("symbol").trim();
  const preset = str("curvePreset") as CurvePresetId;

  if (!name || !symbol) {
    return NextResponse.json({ error: "name and symbol are required" }, { status: 400 });
  }

  // The curve is part of what the token *is*, so it travels in the metadata
  // rather than living only in Juno's own database.
  const attributes: Array<{ trait_type: string; value: string }> = [];
  if (CURVE_PRESETS[preset]) {
    attributes.push(
      { trait_type: "Curve", value: CURVE_PRESETS[preset].label },
      { trait_type: "Launchpad", value: "Juno" },
      { trait_type: "Market", value: "Meteora Dynamic Bonding Curve" },
    );
  }
  if (str("navFeedId")) {
    attributes.push({ trait_type: "NAV feed", value: str("navFeedId") });
  }

  try {
    const pinned = await pinTokenMetadata({
      name,
      symbol,
      description: str("description"),
      imageUrl: str("imageUrl") || undefined,
      mediaMimeType: str("mimeType") || undefined,
      posterUrl: str("posterUrl") || undefined,
      externalUrl: str("externalUrl") || undefined,
      attributes,
    });
    return NextResponse.json(pinned, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pin failed" },
      { status: 502 },
    );
  }
}
