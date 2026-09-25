import { junoError, junoJson, junoOptions, junoRead } from "@/lib/juno/api";
import { fetchPoolSnapshot } from "@/lib/juno/dbc";
import { sampleDepth, suggestSize } from "@/lib/juno/depth";
import { quoteTokenUsdPrice } from "@/lib/juno/pyth";
import { getPool } from "@/lib/juno/registry";
import { assertAddress } from "@/lib/juno/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * What this curve can absorb.
 *
 * `GET ?mint=&side=buy|sell&max=&impact=` returns a depth curve sampled across
 * sizes and, when `impact` is given, the largest trade that stays under it.
 *
 * One pool read serves both: `swapQuote` is local arithmetic over the fetched
 * account, so twenty-eight probes cost one RPC call between them.
 */
export async function GET(request: Request) {
  return junoRead(async () => {
    const url = new URL(request.url);
    const mint = url.searchParams.get("mint") ?? "";
    if (!mint) return junoError("A mint is required");
    assertAddress(mint, "mint");

    const side = url.searchParams.get("side") === "sell" ? "sell" : "buy";

    const row = await getPool(mint);
    if (!row) return junoError("Coin not found", 404);

    const rate = (await quoteTokenUsdPrice(row.quoteMint).catch(() => null)) ?? 1;
    const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
    if (!snapshot) return junoError("Pool is not on this cluster", 404);

    /*
     * The default ceiling is scaled to the curve, not picked.
     *
     * A fixed "10 SOL" is meaningless across four presets and two quote
     * tokens: on a thin-name curve it is the whole book, on a deep one it is
     * noise. What remains to raise before graduation is the only size that
     * means the same thing on every pool.
     */
    const remaining = Math.max(snapshot.curve.thresholdUsd - snapshot.curve.raisedUsd, 0) / rate;
    // For a sell, roughly the base that has been bought out of the curve so
    // far — quote raised, at the current price. It is only where the search
    // stops looking, never a figure this route publishes, so an approximation
    // is the right kind of number here.
    const sold = snapshot.price > 0 ? snapshot.curve.raisedUsd / rate / snapshot.price : 0;
    const fallback = side === "buy" ? Math.max(remaining, 0.1) : sold;
    const asked = Number(url.searchParams.get("max"));
    const max = Number.isFinite(asked) && asked > 0 ? asked : fallback;

    const impact = Number(url.searchParams.get("impact"));
    const budget = Number.isFinite(impact) && impact > 0 ? impact : null;
    if (url.searchParams.has("impact") && budget === null) {
      return junoError("`impact` must be a ratio greater than zero, e.g. 0.01 for 1%");
    }

    /*
     * Sequential, not parallel.
     *
     * Both read the curve's activation point, and firing them together made
     * them race for the same uncached read — one won, the other paid for a
     * second round trip. Run in order, the second is a cache hit, and the two
     * are local arithmetic from there.
     */
    const points = await sampleDepth(snapshot, side, max);
    const suggestion =
      budget === null ? null : await suggestSize(snapshot, side, budget, max);

    return junoJson({
      mint,
      side,
      /** Spot, for the axis the impact is measured against. */
      spot: snapshot.price,
      quoteSymbol: row.quoteMint === "So11111111111111111111111111111111111111112" ? "SOL" : "USDC",
      quoteUsdRate: rate === 1 ? null : rate,
      max,
      points,
      /** Null when no size at all fits the budget — a real answer on a thin curve. */
      suggestion,
    });
  });
}
