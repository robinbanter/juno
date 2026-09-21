import { junoError, junoHandler, junoJson, junoOptions, readJson, requireNumber, requireString } from "@/lib/juno/api";
import { hydratePools } from "@/lib/juno/chain";
import { getPool, listPools } from "@/lib/juno/registry";
import { crossed, unwatch, watch, watchlist } from "@/lib/juno/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Coins a wallet is watching, priced, with any alert resolved.
 *
 * The rows come from Postgres and are always complete; the prices come from the
 * chain and may not be. `missing` says how many could not be priced rather than
 * dropping them silently, which is the same contract every other list here
 * follows.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
    if (!wallet) return junoError("A wallet is required");

    const rows = await watchlist(wallet);
    if (rows.length === 0) return junoJson({ wallet, items: [], missing: 0 });

    const registry = await listPools(60);
    const wanted = new Set(rows.map((row) => row.baseMint));
    const { coins, missing } = await hydratePools(registry.filter((row) => wanted.has(row.baseMint)));
    const priced = new Map(coins.map((coin) => [coin.address, coin]));

    const items = rows.map((row) => {
      const coin = priced.get(row.baseMint) ?? null;
      return {
        baseMint: row.baseMint,
        watchedAt: row.createdAt,
        alertPrice: row.alertPrice,
        // Null when the coin could not be priced: an alert cannot be said to
        // have fired or not fired against a price nobody read.
        alertCrossed: coin ? crossed(row, coin.priceUsd) : null,
        coin: coin
          ? {
              address: coin.address,
              name: coin.name,
              symbol: coin.symbol,
              priceUsd: coin.priceUsd,
              marketCap: coin.marketCap,
              currency: coin.marketCapCurrency,
              changePct: coin.marketCapChangePct,
              progress: coin.curve.progress,
              graduated: coin.curve.graduated,
              media: coin.media,
            }
          : null,
      };
    });

    return junoJson({ wallet, items, missing });
  });
}

/** `POST {wallet, baseMint, watch?: boolean, alertPrice?: number}`. */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const wallet = requireString(body.wallet, "wallet");
    const baseMint = requireString(body.baseMint, "baseMint");

    if (body.watch === false) {
      await unwatch(wallet, baseMint);
      return junoJson({ baseMint, watching: false });
    }

    // A pool that is not in the registry cannot be watched: the list would
    // carry a row nothing can ever price.
    const row = await getPool(baseMint);
    if (!row) return junoError("Coin not found", 404);

    let alert: { price: number; priceNow: number } | null = null;
    if (body.alertPrice !== undefined && body.alertPrice !== null) {
      const price = requireNumber(body.alertPrice, "alertPrice");
      const priceNow = requireNumber(body.priceNow, "priceNow");
      alert = { price, priceNow };
    }

    await watch(wallet, baseMint, alert);
    return junoJson({ baseMint, watching: true, alertPrice: alert?.price ?? null });
  });
}
