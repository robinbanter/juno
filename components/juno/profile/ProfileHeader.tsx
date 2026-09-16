"use client";

import { Bell, ChevronDown, Mail, MoreHorizontal } from "lucide-react";

import { compact } from "@/lib/juno/format";
import type { Creator } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";
import { Delta } from "../ui/Delta";

/**
 * A creator's header: identity, the creator coin's live market cap, and the
 * two actions that matter — buy the coin, follow the person.
 */
export function ProfileHeader({
  creator,
  following = false,
  onBuy,
  onFollow,
  onMessage,
}: {
  creator: Creator;
  following?: boolean;
  onBuy?: () => void;
  onFollow?: () => void;
  onMessage?: () => void;
}) {
  return (
    <section className="px-4 pt-2 sm:px-0">
      <div className="flex items-start gap-4">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={68} ring />

        <div className="min-w-0 flex-1 pt-1">
          <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight">
            ${creator.ticker}
          </h1>
          <button
            type="button"
            className="-ml-0.5 mt-0.5 flex items-center gap-1 rounded px-0.5 text-[14px] text-j-muted transition-colors hover:text-j-ink focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
          >
            <span className="truncate">{creator.displayName}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton label="Notify me about this creator">
            <Bell size={19} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="More options">
            <MoreHorizontal size={19} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      {creator.bio && (
        <p className="mt-4 text-[15px] leading-[1.45] text-j-ink">{creator.bio}</p>
      )}

      {/* Wraps rather than overflowing: at 400px the four stats plus the X
          link do not fit on one line, and clipping the link off the right
          edge would hide it entirely. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
        <span className="flex items-center gap-1">
          <Delta value={creator.marketCap} direction={creator.marketCapChangePct} />
          <span className="text-j-muted">MC</span>
        </span>
        <Stat value={creator.posts} label="Posts" />
        <Stat value={creator.followers} label="Followers" />
        <Stat value={creator.following} label="Following" />

        {creator.socials?.x && (
          <a
            href={creator.socials.x}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="X profile"
            className="ml-auto text-j-ink transition-opacity hover:opacity-60"
          >
            <XLogo />
          </a>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="buy" size="lg" className="flex-1" onClick={onBuy}>
          Buy
        </Button>
        <Button
          variant={following ? "outline" : "contrast"}
          size="lg"
          className="flex-1"
          onClick={onFollow}
        >
          {following ? "Following" : "Follow"}
        </Button>
        <IconButton label="Message" className="size-[52px]" onClick={onMessage}>
          <Mail size={19} strokeWidth={1.75} />
        </IconButton>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="font-semibold tabular-nums">{compact(value, 1)}</span>
      <span className="text-j-muted">{label}</span>
    </span>
  );
}

function XLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
