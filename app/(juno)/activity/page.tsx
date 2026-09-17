import { listPoolActivity } from "@/lib/juno/activity";
import { cluster } from "@/lib/juno/cluster";
import { WSOL } from "@/lib/juno/dbc";
import { listPools } from "@/lib/juno/registry";
import { ActivityList } from "@/components/juno/coin/ActivityList";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const pools = await listPools(20);

  // One RPC page per pool, merged newest-first. Fine at this scale; an
  // indexer is the answer once there are more pools than fit in one screen.
  const perPool = await Promise.all(
    pools.map(async (pool) => {
      const rows = await listPoolActivity(pool.poolAddress, pool.baseMint, {
        limit: 10,
        quoteSymbol: pool.quoteMint === WSOL.mint ? "SOL" : "USDC",
      });
      return rows.map((row) => ({
        ...row,
        coinName: pool.name,
        coinAddress: pool.baseMint,
      }));
    }),
  );

  const feed = perPool
    .flat()
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 pt-4 lg:px-8">
      <h1 className="mb-1 text-[24px] font-bold tracking-tight">Activity</h1>
      <p className="mb-4 text-[14px] text-j-muted">
        Every transaction against a Juno pool on {cluster()}, newest first.
      </p>
      <ActivityList items={feed} showCoin empty="Nothing has traded yet." />
    </div>
  );
}
