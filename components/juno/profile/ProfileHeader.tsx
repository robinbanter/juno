"use client";


import { compact } from "@/lib/juno/format";
import type { Creator } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Delta } from "../ui/Delta";

/**
 * A creator's header: identity, the combined live market cap of their coins,
 * and the two actions that matter: buy their latest coin, follow the person.
 *
 * Every control here does something. Notify, More options, Message and a
 * name dropdown used to sit here with no handler behind them. Juno has no
 * notifications or messaging, so they are gone rather than left as buttons
 * that silently do nothing.
 */
export function ProfileHeader({
  creator,
  following = false,
  canFollow = false,
  isSelf = false,
  followPending = false,
  onBuy,
  onFollow,
}: {
  creator: Creator;
  following?: boolean;
  /** False with no wallet connected, or when this is your own profile. */
  canFollow?: boolean;
  isSelf?: boolean;
  followPending?: boolean;
  /** Opens the creator's newest coin. Absent when they have launched none. */
  onBuy?: () => void;
  onFollow?: () => void;
}) {
  return (
    <section className="px-4 pt-2 sm:px-0">
      <div className="flex items-start gap-4">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={68} ring />

        <div className="min-w-0 flex-1 pt-1">
          <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight">
            ${creator.ticker}
          </h1>
          <p className="mt-0.5 truncate text-[14px] text-j-muted">{creator.displayName}</p>
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
          <Delta value={creator.marketCap} direction={creator.marketCapChangePct} currency={creator.marketCapCurrency} />
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
        {onBuy && (
          <Button variant="buy" size="lg" className="flex-1" onClick={onBuy}>
            Buy latest
          </Button>
        )}
        <Button
          variant={following ? "outline" : "contrast"}
          size="lg"
          className="flex-1"
          onClick={onFollow}
          disabled={!canFollow || followPending}
          // The counts beside this button are real for everyone. Only the
          // action is gated, and the label says which gate you are behind
          // rather than sitting there inert.
          title={
            isSelf
              ? "This is your own profile"
              : canFollow
                ? undefined
                : "Connect a wallet to follow"
          }
        >
          {isSelf ? "Your profile" : following ? "Following" : "Follow"}
        </Button>
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
