import { DEMO_ACTIVITY, DEMO_ALL } from "@/lib/juno/mock";
import { ActivityList } from "@/components/juno/coin/ActivityList";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  // Every trade across every Juno pool. Replace with an indexer query over the
  // program's swap events; the row shape is already what `ActivityList` wants.
  const feed = DEMO_ACTIVITY.flatMap((item, i) =>
    DEMO_ALL.slice(0, 4).map((coin, j) => ({
      ...item,
      id: `${item.id}-${coin.address}`,
      timestamp: new Date(
        Date.parse(item.timestamp) - (i * 4 + j) * 1_800_000,
      ).toISOString(),
      coinName: coin.name,
      coinAddress: coin.address,
    })),
  ).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 pt-4 lg:px-8">
      <h1 className="mb-1 text-[24px] font-bold tracking-tight">Activity</h1>
      <p className="mb-4 text-[14px] text-j-muted">
        Every trade across Juno, newest first.
      </p>
      <ActivityList items={feed} showCoin empty="Nothing has traded yet." />
    </div>
  );
}
