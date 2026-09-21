"use client";

import { useMemo, useState } from "react";

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
  unreadable = false,
  missing = 0,
}: {
  creator: Creator;
  coins: Coin[];
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
  const [following, setFollowing] = useState(false);

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
        onFollow={() => setFollowing((v) => !v)}
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
        {/* These two asserted an empty result without reading anything. What
            this wallet holds and what it has traded are both knowable — the
            portfolio and activity reads exist — but neither is wired up here,
            and "Nothing collected yet" is a measurement, not a placeholder. */}
        {tab === "collected" && (
          <Empty>
            What this wallet holds is not read on this page yet.
          </Empty>
        )}
        {tab === "activity" && (
          <Empty>
            This wallet&rsquo;s trades are not read on this page yet.
          </Empty>
        )}
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-[14px] text-j-faint">{children}</p>;
}

const UNPRICED =
  "This creator has launches on record, but the public RPC would not price them just now. Try again in a moment.";
