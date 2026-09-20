import { hydratePools } from "@/lib/juno/chain";
import { listPools } from "@/lib/juno/registry";
import { junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * The market list: every Juno coin on this cluster, priced.
 *
 * List views deliberately skip the detailed reads — holders, fee metrics, swap
 * history — because a grid shows none of them and each one is another call
 * against an endpoint that throttles.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 60);
    const sort = url.searchParams.get("sort");

    const coins = await hydratePools(await listPools(limit));

    if (sort === "marketCap") {
      coins.sort((a, b) => b.marketCap - a.marketCap);
    } else if (sort === "graduating") {
      /*
       * Closest to its migration threshold first — the coins about to become
       * permanent AMM markets.
       *
       * A pool that has already graduated is *done*, so it drops to the bottom
       * rather than topping a list about what is next. This matches the web
       * `/explore` ordering exactly; the two disagreed until a graduated pool
       * started correctly reporting 100% progress, at which point the API
       * started leading with pools that had already finished.
       */
      const rank = (coin: (typeof coins)[number]) =>
        coin.curve.graduated ? -1 : coin.curve.progress;
      coins.sort((a, b) => rank(b) - rank(a));
    }

    return junoJson({ cluster: cluster(), coins });
  });
}
