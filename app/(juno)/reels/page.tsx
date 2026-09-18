import Link from "next/link";

import { hydratePoolsReport } from "@/lib/juno/chain";
import { UnavailableNotice } from "@/components/juno/UnavailableNotice";
import { cluster } from "@/lib/juno/cluster";
import { listPools } from "@/lib/juno/registry";
import { commentCounts, likeCounts } from "@/lib/juno/social";
import { ReelFeed } from "@/components/juno/reels/ReelFeed";

export const metadata = { title: "Reels" };
export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const report = await hydratePoolsReport(await listPools());
  let reels = report.coins.filter((coin) => coin.format === "reel");
  const unavailable = report.unavailable.filter((row) => row.format === "reel");

  // Seed the counts server-side so the rail paints the real number instead of
  // a zero that jumps once each card's own fetch lands. One aggregate for the
  // whole feed, and a Mongo outage just leaves the counts at zero rather than
  // taking the feed down with it.
  try {
    const mints = reels.map((c) => c.address);
    const [likes, comments] = await Promise.all([
      likeCounts(mints, cluster()),
      commentCounts(mints, cluster()),
    ]);
    reels = reels.map((coin) => ({
      ...coin,
      likes: likes[coin.address] ?? 0,
      commentCount: comments[coin.address] ?? 0,
    }));
  } catch {
    // Leave the counts unset; the like hook fills its own in if Mongo recovers.
  }

  // "No reels yet" only if there really are none — not when the RPC refused them.
  if (reels.length === 0 && unavailable.length > 0) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pt-6">
        <UnavailableNotice
          missing={unavailable.length}
          total={unavailable.length}
          names={unavailable.map((row) => row.name)}
          retryHref="/reels"
        />
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
      {unavailable.length > 0 && (
        <div className="px-4 pt-3">
          <UnavailableNotice
            missing={unavailable.length}
            total={reels.length + unavailable.length}
            names={unavailable.map((row) => row.name)}
            retryHref="/reels"
          />
        </div>
      )}
      <ReelFeed reels={reels} />
    </div>
  );
}
