
import { junoJson, junoOptions } from "@/lib/juno/api";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import { fetchPoolSnapshot, getDbcClient } from "@/lib/juno/dbc";
import { fetchPythPrice, quoteTokenUsdPrice } from "@/lib/juno/pyth";
import { isTesseraRef, tesseraToken } from "@/lib/juno/tessera";
import { listPools, recordLaunch } from "@/lib/juno/registry";
import type { CoinFormat, CurvePresetId } from "@/lib/juno/types";

export const runtime = "nodejs";
// The registry is a live index of on-chain state; a cached response would
// hide a launch that just confirmed.
export const dynamic = "force-dynamic";
/** The Expo client is a different origin; the preflight has to answer. */
export const OPTIONS = junoOptions;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET() {
  const rows = await listPools();
  return junoJson({ pools: rows });
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
    return junoJson({ error: "Body must be JSON" }, { status: 400 });
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
      return junoJson({ error: `${key} is not an address` }, { status: 400 });
    }
  }
  if (!name || !symbol || !createSignature) {
    return junoJson(
      { error: "name, symbol and createSignature are required" },
      { status: 400 },
    );
  }
  if (!CURVE_PRESETS[curvePreset]) {
    return junoJson({ error: "Unknown curve preset" }, { status: 400 });
  }
  if (format !== "post" && format !== "reel") {
    return junoJson({ error: "format must be post or reel" }, { status: 400 });
  }

  // The chain is the authority on whether this pool exists, and on who its
  // creator and base mint actually are. Trusting the client here would let a
  // caller attribute someone else's pool to themselves.
  const onChain = await getDbcClient().state.getPool(poolAddress);
  if (!onChain) {
    return junoJson(
      { error: "No such pool on this cluster" },
      { status: 404 },
    );
  }
  const state = (onChain as unknown as {
    poolState: { baseMint: { toBase58(): string }; creator: { toBase58(): string }; config: { toBase58(): string } };
  }).poolState;

  if (state.baseMint.toBase58() !== baseMint) {
    return junoJson({ error: "baseMint does not match the pool" }, { status: 400 });
  }
  if (state.creator.toBase58() !== creatorWallet) {
    return junoJson({ error: "creatorWallet does not match the pool" }, { status: 400 });
  }
  if (state.config.toBase58() !== configAddress) {
    return junoJson({ error: "configAddress does not match the pool" }, { status: 400 });
  }

  const num = (key: string) =>
    typeof body[key] === "number" ? (body[key] as number) : null;

  const navFeedId = str("navFeedId") || null;

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
    navFeedId: navFeedId,
    navUnitsPerToken: await parityRatio(navFeedId, poolAddress, quoteMint),
    mediaUrl: str("mediaUrl") || null,
    posterUrl: str("posterUrl") || null,
    /*
     * Stored, where before it was dropped: `mediaKind` reads this column and
     * nothing else, so every video launched through this route was recorded
     * as an image and could never appear in the reel feed. Only the two kinds
     * the app renders are accepted.
     */
    mediaMime: /^(image|video)\/[\w.+-]+$/.test(str("mediaMime")) ? str("mediaMime") : null,
    mediaWidth: num("mediaWidth"),
    mediaHeight: num("mediaHeight"),
    createSignature,
  });

  return junoJson({ pool: row }, { status: 201 });
}

/**
 * How much of the reference one token stands for, fixed at launch.
 *
 * A curve token and a share are not the same kind of number — one costs a
 * hundredth of a cent, the other hundreds of dollars — so a NAV band needs a
 * conversion or it reports every tracker as 100% below its underlying. The
 * conversion is chosen once, here, as *whatever makes this market start at
 * parity*: the curve's opening price divided by the reference's price at the
 * same moment.
 *
 * That is the only defensible choice. Picking any other ratio would be
 * declaring the market mispriced on the day it opened, and the band exists to
 * measure drift from the issue, not to grade the issue itself.
 *
 * Null when the reference could not be read. A tracker with no ratio shows no
 * deviation, which is the honest outcome — better than one derived from a
 * price nobody managed to fetch.
 */
async function parityRatio(
  navFeedId: string | null,
  poolAddress: string,
  quoteMint: string,
): Promise<number | null> {
  if (!navFeedId) return null;

  const [reference, snapshot] = await Promise.all([
    referencePriceUsd(navFeedId),
    fetchPoolSnapshot(poolAddress).catch(() => null),
  ]);
  if (reference === null || !(reference > 0) || !snapshot) return null;

  // The curve's price in USD at this instant. `fetchPoolSnapshot` prices in
  // quote units, so it needs the quote's own dollar rate to compare.
  const quoteUsd = await quoteTokenUsdPrice(quoteMint).catch(() => null);
  const openingUsd = snapshot.price * (quoteUsd ?? 1);
  if (!(openingUsd > 0)) return null;

  return openingUsd / reference;
}

async function referencePriceUsd(navFeedId: string): Promise<number | null> {
  if (isTesseraRef(navFeedId)) {
    const token = await tesseraToken(navFeedId).catch(() => null);
    return token?.markPrice ?? null;
  }
  const price = await fetchPythPrice(navFeedId).catch(() => null);
  return price?.priceUsd ?? null;
}
