"use client";

import Link from "next/link";

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { explorer } from "@/lib/juno/cluster";
import { since, tokenAmount, usd } from "@/lib/juno/format";
import type { Activity } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";

/** How close together two fills have to be to read as one decision. */
const RUN_WINDOW_MS = 30 * 60_000;

type Row = Activity & { coinName?: string; coinAddress?: string; runOf?: number };

/**
 * Fold a run of near-identical fills into the decision behind them.
 *
 * Splitting one buy across several transactions is ordinary — a wallet sizing
 * in, a client retrying, a route filling in pieces — and each of those is a
 * real, separately-signed transaction. Listed one per line they were also
 * indistinguishable: four SPACEXX buys of 4145.685, 4145.703, 4145.722 and
 * 4145.740 tokens all round to "4,146" at the same price in the same hour, so
 * the most honest page in this app produced four identical rows and read
 * exactly like seeded demo data. The figures were right and the impression
 * was false, which is the worse failure of the two.
 *
 * Summed instead, with the count shown, so the row says what happened: one
 * wallet, one direction, one coin, N transactions. The price becomes the
 * blended price of the whole run, which is what was actually paid. Nothing is
 * hidden — `runOf` is rendered, and every underlying signature is still on
 * chain behind the explorer link.
 *
 * Same rule and same window as the native feed's `collapseRuns`, so the two
 * surfaces do not disagree about what one decision looks like.
 */
function collapseRuns(items: Row[]): Row[] {
  const out: Row[] = [];

  for (const item of items) {
    const previous = out[out.length - 1];
    const sameDecision =
      previous &&
      previous.wallet === item.wallet &&
      previous.side === item.side &&
      previous.coinAddress === item.coinAddress &&
      Math.abs(Date.parse(previous.timestamp) - Date.parse(item.timestamp)) <= RUN_WINDOW_MS;

    if (sameDecision) {
      previous.amount += item.amount;
      previous.valueUsd += item.valueUsd;
      previous.runOf = (previous.runOf ?? 1) + 1;
      continue;
    }

    out.push({ ...item });
  }

  return out;
}

/**
 * Trade history. Shared by a coin's Activity tab and the global feed — the
 * only difference is whether each row names the coin it happened on.
 */
export function ActivityList({
  items,
  showCoin = false,
  empty = "No trades yet.",
}: {
  items: Array<Activity & { coinName?: string; coinAddress?: string }>;
  showCoin?: boolean;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-[14px] text-j-faint">{empty}</p>;
  }

  const rows = collapseRuns(items);

  return (
    <ul className="divide-y divide-j-line">
      {rows.map((item) => {
        // Decoding size and direction out of the swap log is indexer work.
        // Until that exists a row shows what the RPC actually returned.
        const decoded = item.amount > 0 || item.valueUsd > 0;
        return (
        <li key={item.id} className="flex items-center gap-3 py-3 text-[14px]">
          <Avatar src={item.actor.avatarUrl} alt={item.actor.handle} size={22} />

          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">{item.actor.handle}</span>
              {/* Says the row is a sum, so the count is never something the
                  reader has to infer from a figure that looks too round. */}
              {item.runOf && item.runOf > 1 && (
                <span className="shrink-0 rounded-full bg-j-surface px-1.5 py-px text-[11px] tabular-nums text-j-muted">
                  ×{item.runOf}
                </span>
              )}
            </span>
            {showCoin && item.coinName && (
              <Link
                href={`/coin/${item.coinAddress}`}
                className="truncate text-[12px] text-j-muted hover:text-j-ink hover:underline"
              >
                {item.coinName}
              </Link>
            )}
          </span>

          {decoded ? (
            <>
              <span
                className={cn(
                  "w-10 shrink-0 font-semibold capitalize",
                  item.side === "buy" ? "text-j-pos" : "text-j-neg",
                )}
              >
                {item.side}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums">
                {tokenAmount(item.amount)}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-j-muted">
                {usd(item.valueUsd)}
              </span>
            </>
          ) : (
            item.signature && (
              <a
                href={explorer.tx(item.signature)}
                target="_blank"
                rel="noreferrer noopener"
                className="flex shrink-0 items-center gap-1 text-j-muted transition-colors hover:text-j-ink"
              >
                View tx
                <ExternalLink size={11} />
              </a>
            )
          )}
          <span className="w-10 shrink-0 text-right tabular-nums text-j-faint">
            {since(item.timestamp)}
          </span>
        </li>
        );
      })}
    </ul>
  );
}
