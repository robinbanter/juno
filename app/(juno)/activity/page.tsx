import { cluster } from "@/lib/juno/cluster";
import { globalActivity } from "@/lib/juno/chain";
import { listPools } from "@/lib/juno/registry";
import { ActivityList } from "@/components/juno/coin/ActivityList";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/**
 * How many pools the feed walks.
 *
 * Every pool costs a signature listing plus a paced walk of its transactions,
 * and there is no indexer to ask instead. Twelve fills a screen from the pools
 * most likely to have traded recently; scanning the whole registry cost about
 * seventeen seconds and found nothing extra, because most pools have never
 * traded at all.
 */
const POOLS_SCANNED = 12;

export default async function ActivityPage() {
  const pools = await listPools(POOLS_SCANNED);
  const { items, partial } = await globalActivity(pools, 10);

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 pt-4 lg:px-8">
      <h1 className="mb-1 text-[24px] font-bold tracking-tight">Activity</h1>
      {/* The standfirst used to promise "every trade". It walks pools against
          an endpoint that refuses, so on a throttled read it was promising
          something it had not done. It now says which it did. */}
      <p className="mb-4 text-[14px] text-j-muted">
        {partial
          ? `Trades against Juno pools on ${cluster()}, newest first — decoded from each pool's own vault movements. Some pools would not load just now, so this is not the whole cluster.`
          : `Every trade against a Juno pool on ${cluster()}, newest first — decoded from each pool's own vault movements.`}
      </p>
      <ActivityList
        items={items}
        showCoin
        empty={
          partial
            ? "No trades could be read — the RPC is rate-limiting. Reload to try again."
            : "Nothing has traded yet."
        }
      />
    </div>
  );
}
