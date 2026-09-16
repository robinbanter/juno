import Link from "next/link";

import { hydratePools } from "@/lib/juno/chain";
import { listPools } from "@/lib/juno/registry";
import { ReelFeed } from "@/components/juno/reels/ReelFeed";

export const metadata = { title: "Reels" };
export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const coins = await hydratePools(await listPools());
  const reels = coins.filter((coin) => coin.format === "reel");

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
      <ReelFeed reels={reels} />
    </div>
  );
}
