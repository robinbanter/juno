"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { signInMessage } from "@/lib/juno/siws";

/**
 * The wallet this browser is signed in as, shared across every hook on the
 * page so a like, a follow and a comment do not each ask the server.
 * `undefined` = not asked yet.
 */
let known: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

async function currentSession(): Promise<string | null> {
  if (known !== undefined) return known;
  inFlight ??= fetch("/api/juno/session")
    .then((r) => (r.ok ? r.json() : { wallet: null }))
    .then((data: { wallet: string | null }) => (known = data.wallet ?? null))
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Proof of wallet control for social writes (see `lib/juno/siws.ts`).
 *
 * `ensureSession` resolves once the server holds a session for the connected
 * wallet, asking the wallet to sign a free message only when it does not. It
 * throws with a message fit to show the user when that cannot happen — the
 * wallet refused, or cannot sign messages at all.
 */
export function useWalletSession() {
  const { publicKey, signMessage } = useWallet();

  const ensureSession = useCallback(async (): Promise<void> => {
    const wallet = publicKey?.toBase58();
    if (!wallet) throw new Error("Connect a wallet first");
    if ((await currentSession()) === wallet) return;
    if (!signMessage) throw new Error("This wallet cannot sign messages, so it cannot sign in");

    const message = signInMessage({
      domain: window.location.host,
      wallet,
      issuedAt: new Date().toISOString(),
    });
    const signature = await signMessage(new TextEncoder().encode(message)).catch(() => {
      throw new Error("Sign-in was cancelled in the wallet");
    });

    const response = await fetch("/api/juno/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet,
        message,
        signature: btoa(String.fromCharCode(...signature)),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Sign-in failed");
    known = wallet;
  }, [publicKey, signMessage]);

  return { ensureSession };
}

/** Forget the cached session, e.g. after the server answers 401. */
export function forgetSession() {
  known = undefined;
}
