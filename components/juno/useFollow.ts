"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * Follower counts for a creator, and whether the connected wallet follows them.
 *
 * Same contract as `useLikes`: the server owns the counts and every toggle
 * takes them back from the response, so two tabs cannot drift apart. Counts
 * render for everyone; only the action needs a wallet.
 *
 * `isSelf` is separate from `canFollow` on purpose — "you cannot follow
 * yourself" and "connect a wallet first" are different states and deserve
 * different labels.
 */
export type FollowData = {
  followers: number;
  following: number;
  following_them: boolean;
};

export function useFollow(creatorWallet: string | undefined, initial?: FollowData) {
  const { publicKey } = useWallet();
  const viewer = publicKey?.toBase58();

  const [data, setData] = useState<FollowData>(
    initial ?? { followers: 0, following: 0, following_them: false },
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!creatorWallet) return;
    let cancelled = false;

    const query = viewer
      ? `?creator=${creatorWallet}&viewer=${viewer}`
      : `?creator=${creatorWallet}`;
    fetch(`/api/juno/follows${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: FollowData | null) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [creatorWallet, viewer]);

  const isSelf = Boolean(viewer && creatorWallet && viewer === creatorWallet);

  const toggle = useCallback(async () => {
    if (!creatorWallet || !viewer || isSelf || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/juno/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: creatorWallet, viewer }),
      });
      if (!response.ok) return;
      setData((await response.json()) as FollowData);
    } catch {
      // Keep the last server-confirmed state rather than showing a follow that
      // disappears on the next load.
    } finally {
      setPending(false);
    }
  }, [creatorWallet, viewer, isSelf, pending]);

  return {
    ...data,
    pending,
    toggle,
    isSelf,
    canFollow: Boolean(viewer) && !isSelf,
  };
}
