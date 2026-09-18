"use client";

import { useMemo, useState } from "react";

import type { Coin, Creator } from "@/lib/juno/types";
import { useFollow } from "@/components/juno/useFollow";
import { MediaGrid } from "@/components/juno/profile/MediaGrid";
import { ProfileHeader } from "@/components/juno/profile/ProfileHeader";
import { ProfileTabs, type ProfileTabId } from "@/components/juno/profile/ProfileTabs";

/**
 * Client half of the profile route: owns tab state and the follow toggle.
 * The page above stays a Server Component so the header and first tab render
 * in the initial HTML.
 */
export function ProfileView({ creator, coins }: { creator: Creator; coins: Coin[] }) {
  const [tab, setTab] = useState<ProfileTabId>("posts");
  const follow = useFollow(creator.wallet, {
    followers: creator.followers,
    following: creator.following,
    following_them: false,
  });

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
        // Counts come from the hook, not the server snapshot, so the header
        // updates the moment a follow lands instead of waiting for a reload.
        creator={{ ...creator, followers: follow.followers, following: follow.following }}
        following={follow.following_them}
        canFollow={follow.canFollow}
        isSelf={follow.isSelf}
        followPending={follow.pending}
        onFollow={follow.toggle}
      />
      {follow.error && (
        <p role="alert" className="px-4 pb-2 text-[13px] text-j-danger">
          {follow.error}
        </p>
      )}
      <ProfileTabs value={tab} onChange={setTab} />

      <div className="pt-0.5">
        {tab === "posts" && <MediaGrid coins={posts} />}
        {tab === "reels" && (
          <MediaGrid coins={reels} hrefFor={() => "/reels"} empty="No reels yet." />
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
