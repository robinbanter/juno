"use client";

import { usd } from "@/lib/juno/format";
import { useSwapHistory } from "./useSwapHistory";

/**
 * A pool's trailing-24h volume, filled in after paint.
 *
 * Server-rendered as an em-dash and upgraded once `/api/juno/swaps` answers,
 * because the read behind it is a per-transaction walk against an RPC that may
 * refuse — see `lib/juno/indexer.ts`. Blocking a page render on that would
 * trade a fast page for a number that often does not arrive.
 *
 * Renders an em-dash for every state that is not a known figure: still
 * loading, read refused, or a window too short or too holey to sum. Only a
 * genuine zero — a pool we read completely that has not traded in a day —
 * renders as `$0`.
 */
export function Volume24h({
  pool,
  mint,
  quoteSymbol,
  /**
   * Quote→USD rate. Null when there is no price feed, in which case the figure
   * is labelled in the quote token rather than converted at an invented rate.
   */
  rate = null,
}: {
  pool: string;
  mint: string;
  quoteSymbol?: string;
  rate?: number | null;
}) {
  const { data, loading } = useSwapHistory(pool, mint);

  if (loading || data === null || data.volume24h === null) {
    return (
      <span title={loading ? "Reading swap history…" : "Not enough history to total a day"}>
        —
      </span>
    );
  }

  if (rate === null) {
    return (
      <span className="tabular-nums">
        {data.volume24h.toPrecision(3)}
        {quoteSymbol ? ` ${quoteSymbol}` : ""}
      </span>
    );
  }

  return <span className="tabular-nums">{usd(data.volume24h * rate)}</span>;
}
