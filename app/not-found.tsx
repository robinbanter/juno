import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
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
