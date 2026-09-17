"use client";

import { useEffect, useState } from "react";

import type { PricePoint, Swap } from "@/lib/juno/indexer";

/**
 * A pool's swap history, fetched after paint.
 *
 * Three states that must not be collapsed into each other:
 *
 *   loading           — we have not asked yet
 *   data === null     — we asked and the RPC refused
 *   data !== null     — real trades, possibly an empty list
 *
 * The first two both render as "still indexing" or an em-dash; the third can
 * render a zero, because a pool with no trades really has traded nothing.
 * Collapsing a refusal into an empty list is how a rate-limited read becomes a
 * confident `$0` on a trading screen.
 */

export type SwapHistoryData = {
  swaps: Swap[];
  truncated: boolean;
  missed: number;
  volume24h: number | null;
  totalVolume: number | null;
  change24hPct: number | null;
  points: PricePoint[];
};

export function useSwapHistory(pool: string | undefined, mint: string | undefined) {
  const [data, setData] = useState<SwapHistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pool || !mint) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/juno/swaps?pool=${pool}&mint=${mint}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setData(json as SwapHistoryData | null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pool, mint]);

  return { data, loading };
}
