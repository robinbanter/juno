import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found" };

/**
 * A coin, creator or post that is not on this cluster.
 *
 * The route group had no `not-found`, so `notFound()` from a Juno page fell
 * through to Norr's, which renders "This page is behind the veil" and offers
 * "Back to feed". It inherited the sage theme correctly, but the words belong
 * to a different product — and the most common way to land here is a mint
 * address from the other cluster, which is worth saying rather than leaving
 * someone to guess.
 */
export default function JunoNotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[14px] font-semibold tracking-[0.2em] text-j-faint">404</p>
      <h1 className="text-[21px] font-bold tracking-tight">Nothing here on this cluster</h1>
      <p className="max-w-[360px] text-[16px] text-j-muted">
        No coin, creator or post at this address. A mint from another cluster
        looks exactly like this one and will not resolve here.
      </p>
      <Link
        href="/explore"
        className="mt-1 inline-flex h-11 items-center rounded-full bg-j-pos px-6 text-[16px] font-semibold text-j-bg"
      >
        Browse the market
      </Link>
    </main>
  );
}
