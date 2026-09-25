import { junoJson, junoOptions, junoRead } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";
import { leaderboard } from "@/lib/juno/leaderboard";
import { followerCounts } from "@/lib/juno/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Traders, ranked by profit they have actually taken.
 *
 * Built from fills already decoded from vault deltas, so it needs no indexer
 * and invents nothing. `partial` is passed through: a rank built from a short
 * read is short, and saying so is cheaper than a board that looks complete.
 */
export async function GET(request: Request) {
  return junoRead(async () => {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);

    const board = await leaderboard();
    const top = board.traders.slice(0, limit);
    const followers = await followerCounts(top.map((trader) => trader.wallet));

    return junoJson({
      cluster: cluster(),
      partial: board.partial,
      poolsRead: board.poolsRead,
      poolsTotal: board.poolsTotal,
      traders: top.map((trader) => ({
        ...trader,
        followers: followers.get(trader.wallet) ?? 0,
      })),
    });
  });
}
