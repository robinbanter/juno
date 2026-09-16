"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted max-w-sm text-[15px]">
        An unexpected error occurred. You can try again.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="bg-primary text-primary-fg rounded-pill px-6 py-3 text-sm font-bold"
      >
        Try again
      </button>
    </main>
  );
}
