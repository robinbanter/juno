import { CoinGridSkeleton } from "@/components/juno/ui/Skeleton";

/**
 * Shown while a Juno route's server components resolve.
 *
 * Every page reads the chain, which on the public RPC is not instant. A
 * skeleton shaped like the grid it precedes avoids the layout jump a spinner
 * leaves behind.
 */
export default function JunoLoading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 lg:px-8">
      <div className="mb-5 h-6 w-28 animate-pulse rounded bg-j-surface" />
      <CoinGridSkeleton />
    </div>
  );
}
