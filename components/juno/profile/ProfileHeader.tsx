"use client";

import { Loader2 } from "lucide-react";

import { compact } from "@/lib/juno/format";
import type { Creator } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Delta } from "../ui/Delta";

/**
 * A creator's header: identity, the creator coin's live market cap, and the
 * two actions that matter — buy the coin, follow the person.
 */
export function ProfileHeader({
  creator,
  following = false,
  onFollow,
  busy = false,
}: {
  creator: Creator;
  following?: boolean;
  onFollow?: () => void;
  /** A follow write is in flight; the button says so rather than flickering. */
  busy?: boolean;
}) {
  return (
    <section className="px-4 pt-2 sm:px-0">
      <div className="flex items-start gap-4">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={68} ring />

        <div className="min-w-0 flex-1 pt-1">
          <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight">
            ${creator.ticker}
          </h1>
          {/* Was a button with a disclosure chevron and no handler — the
              chevron promised a menu that did not exist. It is the wallet's
              short address, so it is text. */}
          <p className="mt-0.5 truncate text-[14px] text-j-muted">{creator.displayName}</p>
        </div>

        {/*
          A bell and an overflow menu used to sit here, both wired to nothing.
          Notifications for a creator are not stored anywhere — there is no
          subscription table and no delivery — so the bell was an offer this
          app cannot keep, and the menu had no items. Removed rather than left
          as decoration; Follow beside them is the real subscription, and it
          persists.
        */}
      </div>

      {creator.bio && (
        <p className="mt-4 text-[16px] leading-[1.45] text-j-ink">{creator.bio}</p>
      )}

      {/* Wraps rather than overflowing: at 400px the four stats plus the X
          link do not fit on one line, and clipping the link off the right
          edge would hide it entirely. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
        <span className="flex items-center gap-1">
          <Delta value={creator.marketCap} direction={creator.marketCapChangePct} currency={creator.marketCapCurrency} />
          <span className="text-j-muted">MC</span>
        </span>
        {/*
          Posts is a real count of what this wallet launched. Followers and
          following were omitted here because nothing stored them, and printing
          0 would have been a confident claim about an audience this app had
          never measured — on a profile whose whole purpose is to establish
          credibility.

          `junoFollows` stores them now and `followStats` counts them, so the
          figures are shown. They are still omitted rather than zeroed when the
          count could not be read: null and 0 remain different answers, and the
          reason for the original omission survives as the null branch.
        */}
        <Stat value={creator.posts} label="Posts" />
        {creator.followers !== null && (
          <Stat
            value={creator.followers}
            label={creator.followers === 1 ? "Follower" : "Followers"}
          />
        )}
        {creator.following !== null && <Stat value={creator.following} label="Following" />}

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

      {/*
        Follow is the only one of these that was ever real.

        "Buy" sat first and largest and was handed no handler — there is no
        creator coin to buy here, only the coins this wallet launched, and each
        of those has its own buy on its own page. "Message" was the same: Juno
        has no messaging, so the envelope was an affordance for a feature that
        does not exist. Both removed rather than left to be clicked.
      */}
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant={following ? "outline" : "contrast"}
          size="lg"
          className="flex-1"
          onClick={onFollow}
          disabled={busy}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {following ? "Following" : "Follow"}
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
