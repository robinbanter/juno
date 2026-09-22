import { hydratePools } from "@/lib/juno/chain";
import { listPools } from "@/lib/juno/registry";
import { junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";
import { socialCounts } from "@/lib/juno/social";
import type { Coin } from "@/lib/juno/types";

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

    // `?nav=1`: each tracker's reference price too — see `hydratePool`.
    const { coins, missing } = await hydratePools(await listPools(limit), 2, {
      nav: url.searchParams.get("nav") === "1",
    });

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
      const rank = (coin: Coin) =>
        coin.curve.graduated ? -1 : coin.curve.progress;
      coins.sort((a, b) => rank(b) - rank(a));
    }

    /*
     * `?social=1` adds likes and comment counts, and `&viewer=` whether that
     * wallet liked each — what a feed card and a reel rail print.
     *
     * Two grouped Mongo reads for the whole page, and optional in both
     * directions: a Mongo outage leaves the counts off rather than failing a
     * market list whose numbers come from the chain.
     */
    if (url.searchParams.get("social") === "1") {
      const viewer = url.searchParams.get("viewer");
      const counts = await socialCounts(
        coins.map((coin) => coin.address),
        cluster(),
        viewer && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(viewer) ? viewer : null,
      ).catch(() => null);
      if (counts) {
        for (const coin of coins) {
          const entry = counts.get(coin.address);
          if (!entry) continue;
          coin.likes = entry.likes;
          coin.commentCount = entry.comments;
          coin.viewerLiked = entry.viewerLiked;
        }
      }
    }

    return junoJson({
      cluster: cluster(),
      coins,
      /*
       * Registry rows this read could not resolve.
       *
       * Without it the list presents itself as the whole market while it is
       * quietly two coins short, which is what a throttled endpoint produces
       * most of the time. The client shows the number; it does not guess.
       */
      missing,
    });
  });
}
