import { hydratePool, poolActivity } from "@/lib/juno/chain";
import { listPoolHolders } from "@/lib/juno/activity";
import { getPool } from "@/lib/juno/registry";
import { junoError, junoHandler, junoJson, junoOptions } from "@/lib/juno/api";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * One coin, fully hydrated: price, curve, NAV band, chart series and activity.
 *
 * Unlike the web coin page, this cannot stream — a JSON response is one
 * payload — so the caller gets everything at once and the mobile client shows
 * its own skeletons while it waits.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  return junoHandler(async () => {
    const { mint } = await params;

    const row = await getPool(mint);
    if (!row) return junoError("Coin not found", 404);

    // Hydration first, then the rest. `hydratePool` and `poolActivity` both
    // want this pool's swap history, and firing them together made them race
    // for the same uncached read — one won, the other was throttled, and the
    // chart came back empty on a coin whose activity list had four trades in
    // it. Sequenced, the second call is a cache hit.
    const coin = await hydratePool(row, { detailed: true });
    if (!coin) return junoError("Pool is not on this cluster", 404);

    const [activity, holders] = await Promise.all([
      poolActivity(row, 20),
      listPoolHolders(row.baseMint),
    ]);

    return junoJson({
      coin,
      activity,
      holders,
      launchSignature: row.createSignature,
    });
  });
}
