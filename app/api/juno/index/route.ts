import { junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";
import { fetchPoolSnapshot, vaultsOf } from "@/lib/juno/dbc";
import { listPools } from "@/lib/juno/registry";
import { listSwapHistory } from "@/lib/juno/swaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A full walk of every pool is slow by design; give it room. */
export const maxDuration = 300;
export const OPTIONS = junoOptions;

/**
 * Walk every pool once and write down what it decodes.
 *
 * Juno derives fills from the pool's own vault deltas rather than from an
 * indexer, which is the right call — a vault delta cannot be wrong about what
 * happened. Re-deriving them on *every request* is what made the app
 * unreliable: each derivation is a signature listing plus paced pages of
 * parsed transactions, every surface does it, and the public endpoint answers
 * that load with refusals. A coin with four trades regularly rendered "No
 * trades yet".
 *
 * `listSwapHistory` now remembers what it decodes, so one pass here fills the
 * record and every later read only fetches signatures nobody has seen. Safe to
 * re-run and safe to run while the app is serving: the signature is the
 * primary key, so a second pass inserts nothing it already has.
 *
 * `GET /api/juno/index` — optionally `?pool=<address>` for one.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const only = new URL(request.url).searchParams.get("pool");
    const rows = (await listPools(100)).filter(
      (row) => !only || row.poolAddress === only,
    );

    const results: Array<{
      symbol: string;
      pool: string;
      fills: number | null;
      partial: boolean;
      note?: string;
    }> = [];

    for (const row of rows) {
      const snapshot = await fetchPoolSnapshot(row.poolAddress).catch(() => null);
      if (!snapshot) {
        results.push({
          symbol: row.symbol,
          pool: row.poolAddress,
          fills: null,
          partial: true,
          note: "pool unreadable",
        });
        continue;
      }

      const history = await listSwapHistory(row.poolAddress, vaultsOf(snapshot)).catch(
        () => null,
      );
      if (!history) {
        results.push({
          symbol: row.symbol,
          pool: row.poolAddress,
          fills: null,
          partial: true,
          note: "history unreadable",
        });
        continue;
      }

      results.push({
        symbol: row.symbol,
        pool: row.poolAddress,
        fills: history.swaps.length,
        partial: history.partial,
      });

      // Pace between pools. The endpoint's limit is a rate, so the gap is what
      // keeps the next pool's listing legal rather than refused.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    const decoded = results.reduce((sum, row) => sum + (row.fills ?? 0), 0);
    const short = results.filter((row) => row.partial).length;

    return junoJson({
      cluster: cluster(),
      pools: results.length,
      /** Fills on record for these pools after this pass. */
      decoded,
      /** Pools whose walk came back short — re-run to fill them in. */
      short,
      results,
    });
  });
}
