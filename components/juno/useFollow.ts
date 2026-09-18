"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { forgetSession, useWalletSession } from "@/components/juno/wallet/useWalletSession";

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
  const { ensureSession } = useWalletSession();
  const [error, setError] = useState<string | null>(null);
  const viewer = publicKey?.toBase58();

  const [data, setData] = useState<FollowData>(
    initial ?? { followers: 0, following: 0, following_them: false },
  );
  const [pending, setPending] = useState(false);
  // Whose `following_them` we hold, and a counter of writes, for the same
  // reason as in useLikes: before the viewer's state arrives the button read
  // "Follow" to someone who already follows, and pressing it unfollowed.
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const writes = useRef(0);

  useEffect(() => {
    if (!creatorWallet) return;
    let cancelled = false;

    const query = viewer
      ? `?creator=${creatorWallet}&viewer=${viewer}`
      : `?creator=${creatorWallet}`;
    const startedAt = writes.current;
    fetch(`/api/juno/follows${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: FollowData | null) => {
        if (cancelled || !json || writes.current !== startedAt) return;
        setData(json);
        setLoadedFor(viewer ?? null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [creatorWallet, viewer]);

  const isSelf = Boolean(viewer && creatorWallet && viewer === creatorWallet);

  const toggle = useCallback(async () => {
    if (!creatorWallet || !viewer || isSelf || pending || loadedFor !== viewer) return;
    writes.current++;
    setPending(true);
    setError(null);
    try {
      // Following is done as `viewer`; the server needs proof of that once.
      await ensureSession();
      const response = await fetch("/api/juno/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: creatorWallet, viewer }),
      });
      if (!response.ok) {
        if (response.status === 401) forgetSession();
        setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not follow");
        return;
      }
      setData((await response.json()) as FollowData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not follow");
      // Keep the last server-confirmed state rather than showing a follow that
      // disappears on the next load.
    } finally {
      setPending(false);
    }
  }, [creatorWallet, viewer, isSelf, pending, loadedFor, ensureSession]);

  return {
    ...data,
    pending: pending || (Boolean(viewer) && loadedFor !== viewer),
    toggle,
    error,
    isSelf,
    canFollow: Boolean(viewer) && !isSelf,
  };
}
