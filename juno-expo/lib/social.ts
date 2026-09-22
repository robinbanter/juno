import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share } from "react-native";

import { API_URL, juno, type Coin } from "./api";
import { coinLink } from "./markets";
import { useWallet } from "./wallet";

/**
 * A like, held optimistically.
 *
 * The heart fills the instant it is tapped and the write follows. If the write
 * fails the heart goes back — a like that looks recorded and is not is the
 * one outcome worse than a slow heart.
 *
 * `like()` only ever likes; `toggle()` goes both ways. A double tap on a reel
 * must never *unlike* something you already liked, which is exactly what a
 * toggle would do on the second double tap.
 */
export function useLike(coin: Pick<Coin, "address" | "likes" | "viewerLiked">) {
  const wallet = useWallet();
  const [liked, setLiked] = useState(!!coin.viewerLiked);
  const [likes, setLikes] = useState<number | null>(coin.likes ?? null);
  const inFlight = useRef(false);

  // The list re-reads on refresh; the server's answer wins over a stale local one.
  useEffect(() => {
    setLiked(!!coin.viewerLiked);
    setLikes(coin.likes ?? null);
  }, [coin.address, coin.likes, coin.viewerLiked]);

  const write = useCallback(
    async (next: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const before = { liked, likes };
      setLiked(next);
      setLikes((n) => (n === null ? (next ? 1 : null) : Math.max(0, n + (next ? 1 : -1))));
      try {
        const address = wallet.address ?? (await wallet.connect());
        const result = await juno.setLike({ coin: coin.address, wallet: address, like: next });
        setLikes(result.likes);
        setLiked(result.liked);
      } catch {
        setLiked(before.liked);
        setLikes(before.likes);
      } finally {
        inFlight.current = false;
      }
    },
    [coin.address, liked, likes, wallet],
  );

  return {
    liked,
    likes,
    like: () => (liked ? undefined : void write(true)),
    toggle: () => void write(!liked),
  };
}

/**
 * Following a creator, read once a wallet exists.
 *
 * Starts unknown rather than "not following": offering Follow to someone who
 * already follows invites a tap that does nothing visible. Hidden entirely on
 * your own posts.
 */
export function useFollow(target: string) {
  const wallet = useWallet();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const self = wallet.address === target;

  useEffect(() => {
    let live = true;
    if (!wallet.address || self) {
      setFollowing(wallet.address ? null : false);
      return;
    }
    juno
      .followStats(target, wallet.address)
      .then((stats) => {
        if (live) setFollowing(stats.viewerFollows ?? false);
      })
      .catch(() => {
        if (live) setFollowing(false);
      });
    return () => {
      live = false;
    };
  }, [target, wallet.address, self]);

  const toggle = useCallback(async () => {
    if (busy || self) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const address = wallet.address ?? (await wallet.connect());
      const result = await juno.setFollow(address, target, next);
      setFollowing(result.isFollowing);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }, [busy, following, self, target, wallet]);

  return { following, self, toggle };
}

/**
 * Share a coin: the system sheet on a phone, the clipboard where there is none.
 *
 * Resolves to what happened so the caller can say "Link copied" — a share
 * button that silently copies looks like it did nothing.
 */
export async function shareCoin(coin: Pick<Coin, "address" | "name" | "symbol">): Promise<"shared" | "copied" | "failed"> {
  const url = coinLink(API_URL, coin);
  const message = `${coin.name} — $${coin.symbol} is live on Juno. Every post is a market.`;
  try {
    if (Platform.OS === "web") {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        await nav.share({ title: coin.name, text: message, url });
        return "shared";
      }
      await Clipboard.setStringAsync(url);
      return "copied";
    }
    await Share.share(Platform.OS === "ios" ? { message, url } : { message: `${message}\n${url}` });
    return "shared";
  } catch {
    try {
      await Clipboard.setStringAsync(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}

/**
 * The viewer to ask the server about, fixed for the life of a list.
 *
 * Lists pass `viewer` so each heart arrives already filled or not. But the
 * wallet's address changes the first time someone likes anything — that is
 * when the device key is created — and a list keyed on the address would
 * then re-read every pool from chain, which is a minute on the public RPC,
 * to learn something the optimistic heart already shows.
 *
 * So the list waits for the wallet to finish restoring (`ready`), reads with
 * whatever address exists then, and ignores later changes.
 */
export function useViewerOnce(): { ready: boolean; viewer: () => string | null } {
  const wallet = useWallet();
  const address = useRef(wallet.address);
  address.current = wallet.address;
  return { ready: wallet.ready, viewer: () => address.current };
}
