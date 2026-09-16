import { DEMO_REELS } from "@/lib/juno/mock";
import { ReelFeed } from "@/components/juno/reels/ReelFeed";

export const metadata = { title: "Reels" };

export default function ReelsPage() {
  // Swap for a query over pools whose coin `format` is `reel`, newest first.
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <ReelFeed reels={DEMO_REELS} />
    </div>
  );
}
