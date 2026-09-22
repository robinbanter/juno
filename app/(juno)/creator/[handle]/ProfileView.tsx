"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { compact, money } from "@/lib/juno/format";
import type { Coin, Creator } from "@/lib/juno/types";
import { MediaGrid } from "@/components/juno/profile/MediaGrid";
import { ProfileHeader } from "@/components/juno/profile/ProfileHeader";
import { ProfileTabs, type ProfileTabId } from "@/components/juno/profile/ProfileTabs";

/**
 * Client half of the profile route: owns tab state and the follow toggle.
 * The page above stays a Server Component so the header and first tab render
 * in the initial HTML.
 */
export function ProfileView({
  creator,
  coins,
  viewerFollows = null,
  positions = [],
  trades = [],
  portfolioPartial = false,
  unreadable = false,
  missing = 0,
}: {
  creator: Creator;
  coins: Coin[];
  /** Whether the signed-in viewer already follows this creator, when known. */
  viewerFollows?: boolean | null;
  /** What this wallet holds now, from `loadPortfolio`. */
  positions?: CreatorPosition[];
  /** Every fill this wallet signed, newest first, flattened across pools. */
  trades?: CreatorTrade[];
  /** True when a pool's history came back short, so both lists are incomplete. */
  portfolioPartial?: boolean;
  /** Launches exist on record but could not be priced — see the page above. */
  unreadable?: boolean;
  /**
   * How many of this creator's launches are on record but absent from `coins`.
   *
   * The grids below would otherwise read as the complete set of what this
   * wallet has published, and the market cap above it as the complete sum.
   */
  missing?: number;
}) {
  const [tab, setTab] = useState<ProfileTabId>("posts");
  /*
   * Following was a lie the button told itself.
   *
   * `onFollow` flipped this boolean and nothing else. The label changed to
   * "Following", the visitor believed they had followed someone, and no row
   * was written anywhere — a fabricated success state on the one action this
   * profile exists to offer, while `/api/juno/follow` sat there working.
   *
   * It writes now. The optimistic flip stays, because a follow that waits on a
   * round trip feels broken, but a failed write rolls it back rather than
   * leaving the lie on screen.
   */
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [following, setFollowing] = useState(viewerFollows ?? false);
  const [busy, setBusy] = useState(false);

  const onFollow = useCallback(async () => {
    // Nobody to follow *as*. The modal is the next step, not an error.
    if (!publicKey) {
      setVisible(true);
      return;
    }
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const response = await fetch("/api/juno/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          follower: publicKey.toBase58(),
          target: creator.wallet,
          follow: next,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { isFollowing?: boolean };
      // The server's answer wins over the optimistic guess.
      if (typeof result.isFollowing === "boolean") setFollowing(result.isFollowing);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }, [following, publicKey, setVisible, creator.wallet]);

  const { posts, reels } = useMemo(
    () => ({
      posts: coins.filter((c) => c.format === "post"),
      reels: coins.filter((c) => c.format === "reel"),
    }),
    [coins],
  );

  return (
    <>
      <ProfileHeader
        creator={creator}
        following={following}
        onFollow={onFollow}
        busy={busy}
      />
      <ProfileTabs value={tab} onChange={setTab} />

      {missing > 0 && coins.length > 0 && (
        <p className="mx-4 mt-2 rounded-j border border-j-line bg-j-surface px-3 py-2 text-[12px] text-j-muted">
          {missing} of this creator&rsquo;s {creator.posts} launches could not be
          priced just now, so the figures above and the grid below are short by
          that many.
        </p>
      )}

      <div className="pt-0.5">
        {/* "No posts yet" is a claim about the creator; when the prices
            could not be read it is a claim about the RPC. */}
        {tab === "posts" && (
          <MediaGrid
            coins={posts}
            empty={unreadable ? UNPRICED : "No posts yet."}
          />
        )}
        {tab === "reels" && (
          <MediaGrid
            coins={reels}
            hrefFor={() => "/reels"}
            empty={unreadable ? UNPRICED : "No reels yet."}
          />
        )}
        {/* These two used to assert an empty result without reading anything,
            then said so honestly instead. Both are now read: `loadPortfolio`
            returns the positions and the trades behind them, and the page
            streams it in. A short walk still says "could not read" rather
            than "holds nothing" — the two are different claims. */}
        {tab === "collected" && (
          <PositionList
            positions={positions}
            partial={portfolioPartial}
            empty="Nothing held on this cluster."
          />
        )}
        {tab === "activity" && (
          <TradeList
            trades={trades}
            partial={portfolioPartial}
            empty="No trades on this cluster."
          />
        )}
      </div>
    </>
  );
}

/** One holding, narrowed from `Position` to what this list renders. */
export type CreatorPosition = {
  baseMint: string;
  symbol: string;
  name: string;
  balance: number;
  value: number;
  unrealisedPnlPct: number | null;
  currency: string;
};

/** One fill, flattened out of a position's `trades` so every pool shares a list. */
export type CreatorTrade = {
  t: string;
  side: "buy" | "sell";
  base: number;
  price: number;
  symbol: string;
  baseMint: string;
  currency: string;
};

/**
 * Held positions, largest first.
 *
 * `partial` is carried separately from emptiness because a throttled walk and
 * an empty wallet produce the same array, and only one of them is a fact about
 * this creator.
 */
function PositionList({
  positions,
  partial,
  empty,
}: {
  positions: CreatorPosition[];
  partial: boolean;
  empty: string;
}) {
  if (positions.length === 0) return <Empty>{partial ? UNREADABLE : empty}</Empty>;
  return (
    <>
      {partial && <ShortRead />}
      <ul className="divide-y divide-j-line">
        {positions.map((position) => (
          <li key={position.baseMint} className="flex items-center gap-3 py-3">
            <Link
              href={`/coin/${position.baseMint}`}
              className="flex min-w-0 flex-1 flex-col transition-opacity hover:opacity-70"
            >
              <span className="truncate text-[14px] font-semibold">${position.symbol}</span>
              <span className="truncate text-[12px] text-j-muted">
                {compact(position.balance)} tokens
              </span>
            </Link>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-[14px] font-semibold tabular-nums">
                {money(position.value, position.currency)}
              </span>
              {/* Null is not zero: a position whose cost is outside the
                  history window has no percentage to show. */}
              {position.unrealisedPnlPct !== null && (
                <span
                  className={
                    position.unrealisedPnlPct >= 0
                      ? "text-[12px] tabular-nums text-j-up"
                      : "text-[12px] tabular-nums text-j-down"
                  }
                >
                  {position.unrealisedPnlPct >= 0 ? "+" : ""}
                  {(position.unrealisedPnlPct * 100).toFixed(2)}%
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Every fill this wallet signed, newest first. */
function TradeList({
  trades,
  partial,
  empty,
}: {
  trades: CreatorTrade[];
  partial: boolean;
  empty: string;
}) {
  if (trades.length === 0) return <Empty>{partial ? UNREADABLE : empty}</Empty>;
  return (
    <>
      {partial && <ShortRead />}
      <ul className="divide-y divide-j-line">
        {trades.map((trade) => (
          <li
            key={`${trade.baseMint}-${trade.t}-${trade.side}-${trade.base}`}
            className="flex items-center gap-3 py-3"
          >
            <span
              className={
                trade.side === "buy"
                  ? "shrink-0 text-[12px] font-semibold text-j-up"
                  : "shrink-0 text-[12px] font-semibold text-j-down"
              }
            >
              {trade.side === "buy" ? "Buy" : "Sell"}
            </span>
            <Link
              href={`/coin/${trade.baseMint}`}
              className="min-w-0 flex-1 truncate text-[14px] transition-opacity hover:opacity-70"
            >
              ${trade.symbol}
            </Link>
            <span className="shrink-0 text-[14px] tabular-nums">{compact(trade.base)}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-j-muted">
              {money(trade.base * trade.price, trade.currency)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ShortRead() {
  return (
    <p className="pb-2 text-[12px] text-j-faint">
      Some of this wallet&rsquo;s history could not be read — the list below is
      incomplete.
    </p>
  );
}

const UNREADABLE =
  "Could not read this wallet's history just now — the public RPC is rate-limiting. Try again in a moment.";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-[14px] text-j-faint">{children}</p>;
}

const UNPRICED =
  "This creator has launches on record, but the public RPC would not price them just now. Try again in a moment.";
