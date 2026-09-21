import Link from "next/link";

import { hydratePools } from "@/lib/juno/chain";
import { listPools } from "@/lib/juno/registry";
import { cluster } from "@/lib/juno/cluster";
import { countComments } from "@/lib/juno/social";
import { ReelFeed } from "@/components/juno/reels/ReelFeed";

export const metadata = { title: "Reels" };
export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const rows = await listPools();
  const { coins, missing } = await hydratePools(rows);
  const reels = coins.filter((coin) => coin.format === "reel");

  // Rows in the registry with nothing hydrated means the reads failed, not
  // that nobody has published a reel. Saying the wrong one tells a visitor to
  // go create something that already exists.
  const unreadable = rows.length > 0 && coins.length === 0;

  /*
   * Real comment counts, for the reels actually on screen.
   *
   * The rail used to print `coin.commentCount ?? 0`, and nothing ever set it —
   * so every reel claimed zero comments whether or not it had any. Comments are
   * persisted, so the count is available; it just was not being asked for. A
   * failed read leaves it undefined and the rail shows no number, which is the
   * honest version of not knowing.
   */
  const network = cluster();
  const withCounts = await Promise.all(
    reels.map(async (coin) => ({
      ...coin,
      commentCount: await countComments(coin.address, network).catch(() => undefined),
    })),
  );

  if (reels.length === 0 && unreadable) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] font-semibold">Could not read the reels</p>
        <p className="mt-1 max-w-[320px] text-[14px] text-j-muted">
          There are pools on {cluster()}, but the RPC would not serve them just
          now. Juno runs on the public endpoint, which rate-limits. Try again in
          a moment.
        </p>
      </div>
    );
  }

  // "No reels yet" is only true when every pool was read and none was a reel.
  // With rows still unresolved the honest answer is that we do not know.
  if (reels.length === 0 && missing > 0) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] font-semibold">Could not read every pool</p>
        <p className="mt-1 max-w-[320px] text-[14px] text-j-muted">
          {missing} of {rows.length} pools on {cluster()} would not load, so
          whether any of them is a reel is unknown. Try again in a moment.
        </p>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] font-semibold">No reels yet</p>
        <p className="mt-1 max-w-[320px] text-[14px] text-j-muted">
          A reel is a vertical video with its own bonding curve. Publish one and
          people can buy into it as they scroll.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-j-pos px-5 text-[15px] font-semibold text-j-bg"
        >
          Create a reel
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <ReelFeed reels={withCounts} />
    </div>
  );
}
