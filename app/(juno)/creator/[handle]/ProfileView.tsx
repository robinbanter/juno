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
}: {
  creator: Creator;
  coins: Coin[];
  /** Launches exist on record but could not be priced — see the page above. */
  unreadable?: boolean;
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
        {tab === "collected" && <Empty>Nothing collected yet.</Empty>}
        {tab === "activity" && <Empty>No trading activity yet.</Empty>}
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-[14px] text-j-faint">{children}</p>;
}

const UNPRICED =
  "This creator has launches on record, but the public RPC would not price them just now. Try again in a moment.";
