"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { forgetSession, useWalletSession } from "@/components/juno/wallet/useWalletSession";

/**
 * A coin's like count, and whether the connected wallet is one of them.
 *
 * The server owns the count. Every toggle sends the request and takes the
 * count back from the response rather than incrementing a local number — with
 * two tabs open, or a like that races another, an optimistic increment drifts
 * and then silently stays wrong. A like is one round trip; it can afford to be
 * correct.
 *
 * `canLike` is false with no wallet connected, and the caller is expected to
 * disable the control rather than hide the count. A visitor who cannot like
 * should still see how many others did.
 */
export function useLikes(coinMint: string | undefined, initialCount = 0) {
  const { publicKey } = useWallet();
  const { ensureSession } = useWalletSession();
  const wallet = publicKey?.toBase58();
  // Why the last like did not go through — shown by the caller, if it wants.
  const [error, setError] = useState<string | null>(null);

  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);
  // Distinguishes "we have not loaded yet" from "loaded, and it is zero", so
  // the caller can avoid flashing a 0 that turns into a 12.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!coinMint) return;
    let cancelled = false;

    const query = wallet ? `?coin=${coinMint}&wallet=${wallet}` : `?coin=${coinMint}`;
    fetch(`/api/juno/likes${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { count: number; liked: boolean } | null) => {
        if (cancelled || !data) return;
        setCount(data.count);
        setLiked(data.liked);
        setLoaded(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [coinMint, wallet]);

  const toggle = useCallback(async () => {
    if (!coinMint || !wallet || pending) return;
    setPending(true);
    setError(null);
    try {
      // A like is made *as* this wallet, so the server needs proof of it once.
      await ensureSession();
      const response = await fetch("/api/juno/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin: coinMint, wallet }),
      });
      if (!response.ok) {
        if (response.status === 401) forgetSession();
        setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not like");
        return;
      }
      const data = (await response.json()) as { count: number; liked: boolean };
      setCount(data.count);
      setLiked(data.liked);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not like");
      // Leave the displayed state alone. It still reflects the last thing the
      // server confirmed, which is better than a like that appears and then
      // vanishes on the next load.
    } finally {
      setPending(false);
    }
  }, [coinMint, wallet, pending, ensureSession]);

  return { count, liked, loaded, pending, toggle, error, canLike: Boolean(wallet) };
}
