"use client";

import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { compact } from "@/lib/juno/format";
import { useLikes } from "../useLikes";

/**
 * Like control for the coin page.
 *
 * The count renders for everyone; only the button is gated on a wallet. The
 * alternative — hiding the number until you connect — would make an empty coin
 * and a popular one look identical to a visitor.
 */
export function LikeButton({ coinMint, initialCount = 0 }: { coinMint: string; initialCount?: number }) {
  const { count, liked, pending, toggle, canLike } = useLikes(coinMint, initialCount);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canLike || pending}
      aria-pressed={liked}
      aria-label={!canLike ? "Connect a wallet to like" : liked ? "Unlike" : "Like"}
      title={!canLike ? "Connect a wallet to like" : liked ? "Unlike" : "Like"}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        liked ? "text-j-neg" : "text-j-muted hover:text-j-ink",
        // Not `disabled:opacity-40`: the count still has to be readable to
        // someone who cannot click it.
        !canLike && "cursor-not-allowed hover:text-j-muted",
      )}
    >
      <Heart size={16} strokeWidth={1.75} fill={liked ? "currentColor" : "none"} />
      <span className="tabular-nums">{compact(count, 1)}</span>
    </button>
  );
}
