"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/juno/ui/Button";

/**
 * Route-level error boundary for every Juno page.
 *
 * Without one, a thrown render lands on Next's default error page — which is
 * unstyled, says nothing useful, and leaves the visitor with no way back. Most
 * failures here are a refused RPC call, so retry is the right first offer.
 */
export default function JunoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest is the only handle on a server-side throw in production.
    console.error("Juno route error", error.digest ?? "", error.message);
  }, [error]);

  const rpcRefused = /429|rate|fetch failed|ECONNRESET|timeout/i.test(error.message);

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-[520px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[21px] font-semibold">
        {rpcRefused ? "The network is not answering" : "Something broke"}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-j-muted">
        {rpcRefused
          ? "Solana's public RPC rate-limits hard. Retrying usually works; a dedicated endpoint fixes it properly."
          : "This page failed to render. The error has been logged."}
      </p>

      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-j-faint">ref {error.digest}</p>
      )}

      <div className="mt-5 flex gap-2">
        <Button variant="buy" size="md" onClick={reset}>
          <RotateCw size={15} />
          Try again
        </Button>
        <Button variant="outline" size="md" onClick={() => window.location.assign("/explore")}>
          Back to Explore
        </Button>
      </div>
    </div>
  );
}
