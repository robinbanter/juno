import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like the content they precede.
 *
 * Deliberately not a spinner: these pages read on-chain state, and a shape
 * that matches the final layout means nothing jumps when the data lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-j-surface", className)} />;
}

export function CoinGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-square w-full rounded-j-lg" />
          <div className="mt-2 flex items-center gap-1.5">
            <Skeleton className="size-[18px] rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-1.5 h-3 w-16" />
        </li>
      ))}
    </ul>
  );
}

export function CoinPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 lg:px-8" aria-hidden="true">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <Skeleton className="aspect-[4/3] min-w-0 flex-1 rounded-j-lg" />
        <div className="flex w-full shrink-0 flex-col gap-3 lg:max-w-[420px]">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-16 w-full rounded-j" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-[140px] w-full rounded-j" />
          <Skeleton className="h-[52px] w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
