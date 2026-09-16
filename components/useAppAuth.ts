"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  DEV_AUTH_COOKIE,
  DEV_USER_PROFILE,
  isDevAuthEnabled,
  isValidDevAuthCookie,
} from "@/lib/dev-session";
import { CLIENT_USER_COOKIE, decodeClientUser } from "@/lib/privy-session";
import { privyWalletProvider } from "@/lib/privyWallet";

const DEV_AUTH_EVENT = "veil:dev-auth-changed";
const SESSION_EVENT = "zorr:session-changed";
/** Set while a logout is in flight so PrivySessionSync won't re-create the session. */
export const LOGOUT_FLAG = "norr:logging-out";

const DEV_CLIENT_USER = {
  fullName: DEV_USER_PROFILE.displayName,
  primaryEmailAddress: { emailAddress: DEV_USER_PROFILE.email },
} as const;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const eq = part.indexOf("=");
      return eq === -1 ? [part, ""] : [part.slice(0, eq), part.slice(eq + 1)];
    })
    .find(([key]) => key === name)?.[1];
}

function hasDevAuthCookie() {
  if (!isDevAuthEnabled()) return false;
  return isValidDevAuthCookie(
    readCookie(DEV_AUTH_COOKIE) && decodeURIComponent(readCookie(DEV_AUTH_COOKIE)!),
  );
}

function readClientUserCookie() {
  const raw = readCookie(CLIENT_USER_COOKIE);
  return raw ? decodeClientUser(decodeURIComponent(raw)) : null;
}

/** Notify sibling hook instances that the Privy session cookie changed. */
export function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** Legacy name kept for the dev-login flow. */
export function notifyDevAuthChanged() {
  window.dispatchEvent(new Event(DEV_AUTH_EVENT));
}

type AuthState = {
  dev: boolean;
  clientUser: ReturnType<typeof readClientUserCookie>;
  /** null until the first client read resolves (avoids SSR/hydration flash). */
  resolved: boolean;
};

function useAuthCookies(): AuthState {
  const [state, setState] = useState<AuthState>({
    dev: false,
    clientUser: null,
    resolved: false,
  });

  useEffect(() => {
    const sync = () =>
      setState({
        dev: hasDevAuthCookie(),
        clientUser: readClientUserCookie(),
        resolved: true,
      });
    sync();
    window.addEventListener(DEV_AUTH_EVENT, sync);
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(DEV_AUTH_EVENT, sync);
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return state;
}

export function useAppAuth() {
  const { dev, clientUser, resolved } = useAuthCookies();
  const signedIn = dev || !!clientUser;

  return {
    isLoaded: resolved,
    isSignedIn: resolved ? signedIn : undefined,
    isDevSignedIn: dev,
  };
}

export function useAppUser() {
  const { dev, clientUser, resolved } = useAuthCookies();

  if (dev) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: DEV_CLIENT_USER,
      walletAddress: null,
      isDevSignedIn: true,
    };
  }

  const user = clientUser
    ? {
        fullName: clientUser.name,
        primaryEmailAddress: clientUser.email
          ? { emailAddress: clientUser.email }
          : undefined,
      }
    : null;

  return {
    isLoaded: resolved,
    isSignedIn: resolved ? !!clientUser : undefined,
    user,
    // The generated Algorand wallet address (Privy embedded), captured at login.
    walletAddress: clientUser?.addr ?? null,
    isDevSignedIn: false,
  };
}

/**
 * The signed-in user's custodial Algorand wallet address (the account that holds
 * their balance). Fetched from /api/account; null when signed out.
 */
export function useCustodialWalletAddress() {
  const { isSignedIn } = useAppAuth();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch("/api/account", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled) setAddress(d?.account?.tempoWalletAddress ?? null);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(SESSION_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EVENT, load);
    };
  }, [isSignedIn]);

  return address;
}

export function useAppSignOut() {
  const { wallets } = useWallet();

  return useCallback(
    async ({ redirectUrl = "/" }: { redirectUrl?: string } = {}) => {
      // Flag the logout so PrivySessionSync won't re-create the session if Privy
      // briefly resumes an authenticated state before its logout fully clears.
      try {
        sessionStorage.setItem(LOGOUT_FLAG, "1");
      } catch {
        // sessionStorage unavailable — the direct logout below still runs.
      }
      // Disconnect any connected use-wallet wallets…
      await Promise.allSettled(
        wallets.filter((w) => w.isConnected).map((w) => w.disconnect()),
      );
      // …and log out of Privy directly. This is the fix: the active use-wallet
      // may be null (a Privy session with no active connector), so relying on
      // activeWallet.disconnect() alone left Privy logged in, and the session
      // was re-created on reload.
      try {
        await privyWalletProvider.disconnect();
      } catch {
        // ignore — we still clear the server session below.
      }
      await Promise.allSettled([
        fetch("/api/auth/privy", { method: "DELETE" }),
        fetch("/api/dev/logout", { method: "POST" }),
      ]);
      notifySessionChanged();
      notifyDevAuthChanged();
      window.location.assign(redirectUrl);
    },
    [wallets],
  );
}
