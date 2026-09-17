"use client";

import Link from "next/link";

import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { explorer } from "@/lib/juno/cluster";
import { since, tokenAmount, usd } from "@/lib/juno/format";
import type { Activity } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";

/**
 * Trade history. Shared by a coin's Activity tab and the global feed — the
 * only difference is whether each row names the coin it happened on.
 */
export function ActivityList({
  items,
  showCoin = false,
  empty = "No trades yet.",
}: {
  items: Array<
    Activity & { coinName?: string; coinAddress?: string; valueLabel?: string }
  >;
  showCoin?: boolean;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-[14px] text-j-faint">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-j-line">
      {items.map((item) => {
        // `lib/juno/indexer.ts` fills these in from token-balance deltas.
        // Both zero means that read was refused, so the row falls back to the
        // transaction link rather than printing a direction nobody read.
        const decoded = item.amount > 0 || item.valueUsd > 0;
        return (
        <li key={item.id} className="flex items-center gap-3 py-3 text-[13px]">
          <Avatar src={item.actor.avatarUrl} alt={item.actor.handle} size={22} />

          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium">{item.actor.handle}</span>
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
                {item.valueLabel ?? usd(item.valueUsd)}
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
