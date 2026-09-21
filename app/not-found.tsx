import Link from "next/link";
import type { Metadata } from "next";

/*
 * The title is generated rather than static so it can escape the root
 * layout's "%s · Norr" template on a Juno deployment. `title.absolute`
 * overrides the template outright; a plain string would inherit it and put a
 * different product's name on Juno's 404 — which is exactly what a visitor
 * saw after mistyping any Juno URL.
 */
export function generateMetadata(): Metadata {
  if (process.env.JUNO_ROOT === "1") {
    return { title: { absolute: "Page not found · Juno" } };
  }
  return { title: "Page not found" };
}

/**
 * The 404 for a route that matched nothing at all.
 *
 * Juno's own pages have `app/(juno)/not-found.tsx`; this one catches the URLs
 * that belong to no route group, which on a Juno deployment means every
 * plausible guess a visitor makes — `/leaderboard`, `/portfolio`, `/stocks`.
 * Those rendered Norr's "behind the veil" copy and offered "Back to feed",
 * sending someone looking for Juno further into a product they did not ask
 * for. Gated on the same `JUNO_ROOT` as the root page, for the same reason.
 */
export default function NotFound() {
  if (process.env.JUNO_ROOT === "1") {
    return (
      <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[14px] font-semibold tracking-[0.2em] text-j-faint">404</p>
        <h1 className="text-[21px] font-bold tracking-tight">No such page</h1>
        <p className="max-w-[360px] text-[16px] text-j-muted">
          Nothing is served at this address. The market is the place to start.
        </p>
        <Link
          href="/explore"
          className="rounded-pill bg-j-ink px-6 py-3 text-sm font-bold text-j-bg"
        >
          Browse the market
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-faint text-sm font-semibold tracking-[0.2em]">404</p>
      <h1 className="text-2xl font-bold">This page is behind the veil</h1>
      <p className="text-muted max-w-sm text-[15px]">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-fg rounded-pill px-6 py-3 text-sm font-bold"
      >
        Back to feed
      </Link>
    </main>
  );
}
