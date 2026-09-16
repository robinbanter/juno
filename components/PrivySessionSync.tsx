"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useWallet } from "@txnlab/use-wallet-react";
import { solanaPubkeyToAlgorandAddress } from "@/lib/privyWallet";
import { LOGOUT_FLAG, notifySessionChanged } from "./useAppAuth";

/**
 * Bridges Privy's client auth into the Norr server session. When Privy is
 * authenticated it verifies + exchanges the access token for our signed session
 * cookie (via /api/auth/privy); on logout it clears it. Renders nothing.
 */
export function PrivySessionSync() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const { activeAddress } = useWallet();
  const { wallets: solanaWallets } = useWallets();

  // The generated Algorand wallet: prefer use-wallet's active address, but fall
  // back to re-encoding Privy's embedded Solana wallet directly — a Privy session
  // often has no active use-wallet connector, which left the address empty.
  const embedded =
    solanaWallets.find((w) => w.standardWallet?.name === "Privy") ??
    solanaWallets[0] ??
    null;
  const algoAddress =
    activeAddress ??
    (embedded?.address ? solanaPubkeyToAlgorandAddress(embedded.address) : null);
  // Tracks the last synced (token+address) so we don't re-POST on every render,
  // and starts null so we never clear a valid cookie before the first login.
  const syncedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      if (authenticated) {
        // A logout is in flight — force Privy out instead of re-creating the
        // session (a stale token could otherwise resume us straight back in).
        let loggingOut = false;
        try {
          loggingOut = !!sessionStorage.getItem(LOGOUT_FLAG);
        } catch {
          // sessionStorage unavailable.
        }
        if (loggingOut) {
          try {
            await logout();
          } catch {
            // ignore — the flag stays set until Privy reports signed-out.
          }
          return;
        }

        const token = await getAccessToken();
        if (!token || cancelled) return;
        const key = `${token}:${algoAddress ?? ""}`;
        if (syncedKey.current === key) return;

        const res = await fetch("/api/auth/privy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            address: algoAddress,
            profile: deriveProfile(user),
          }),
        });
        if (res.ok && !cancelled) {
          syncedKey.current = key;
          notifySessionChanged();
        }
      } else {
        // Privy is signed out — the logout (if any) succeeded; clear the flag.
        try {
          sessionStorage.removeItem(LOGOUT_FLAG);
        } catch {
          // ignore
        }
        if (syncedKey.current !== null) {
          syncedKey.current = null;
          await fetch("/api/auth/privy", { method: "DELETE" });
          if (!cancelled) notifySessionChanged();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, algoAddress, getAccessToken, user, logout]);

  return null;
}

/** Best-effort display profile from Privy's linked accounts. */
function deriveProfile(user: unknown): {
  name: string | null;
  email: string | null;
  image: string | null;
} {
  const u = (user ?? {}) as Record<string, { name?: string; username?: string; address?: string; email?: string; profilePictureUrl?: string }>;
  const name =
    u.twitter?.name ??
    u.twitter?.username ??
    u.github?.username ??
    u.google?.name ??
    u.email?.address ??
    null;
  const email = u.email?.address ?? u.google?.email ?? null;
  const image = u.twitter?.profilePictureUrl ?? null;
  return { name: name ?? null, email: email ?? null, image: image ?? null };
}
