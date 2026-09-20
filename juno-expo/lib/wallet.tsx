import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Keypair, Transaction } from "@solana/web3.js";

import { juno } from "./api";

/**
 * The wallet.
 *
 * Juno's transactions are built on the server and signed here. This module owns
 * that second half: it holds a signing key, turns base64 transaction bytes into
 * a signed transaction, and hands the result back to be submitted.
 *
 * ## Two backends, and why both exist
 *
 * **Privy embedded wallet** is the intended one. It gives someone a Solana
 * wallet without installing anything, which is the only option that works in an
 * iOS Simulator — Solana's Mobile Wallet Adapter is Android-only and a Phantom
 * deeplink needs the real app installed, so neither can sign during the demo
 * this app is built for.
 *
 * **A local devnet key** is the fallback. Privy needs a mobile client
 * registered against this bundle id in its dashboard, which is account
 * configuration nobody can do from inside the code. Rather than leave the app
 * unusable until that exists, this mode generates a keypair, keeps it in the
 * device keychain, and signs with it.
 *
 * The local mode is **not a simulation**. It produces real Ed25519 signatures,
 * lands real transactions on devnet, and the explorer link resolves. What it is
 * not is a recoverable wallet — the key lives only on this device and is worth
 * nothing beyond devnet. `mode` is exposed so the UI can say exactly that
 * rather than implying a custody story it does not have.
 */

export type WalletMode = "privy" | "local";

export type WalletState = {
  address: string | null;
  mode: WalletMode;
  ready: boolean;
  /** True while a signature is being produced. */
  signing: boolean;
  /**
   * Sign one server-built transaction and return it, still base64.
   *
   * Takes and returns base64 because that is what crosses the wire in both
   * directions; the `Transaction` round-trip is an implementation detail of
   * whichever backend is signing.
   */
  sign: (base64: string) => Promise<string>;
  /** Create or restore a wallet. Called when the user first needs one. */
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

/** Keychain entry holding the local devnet key. */
const LOCAL_KEY = "juno.devnet.signer.v1";

async function loadLocalKeypair(): Promise<Keypair | null> {
  try {
    const stored = await SecureStore.getItemAsync(LOCAL_KEY);
    if (!stored) return null;
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
  } catch {
    // A corrupt entry is worth discarding rather than crashing the app on boot.
    return null;
  }
}

async function createLocalKeypair(): Promise<Keypair> {
  const keypair = Keypair.generate();
  await SecureStore.setItemAsync(LOCAL_KEY, JSON.stringify([...keypair.secretKey]));
  return keypair;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [ready, setReady] = useState(false);
  const [signing, setSigning] = useState(false);

  // Restore an existing key on boot so a returning user keeps their balance
  // and their position history.
  useEffect(() => {
    let cancelled = false;
    loadLocalKeypair().then((existing) => {
      if (cancelled) return;
      setKeypair(existing);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const existing = keypair ?? (await loadLocalKeypair());
    if (existing) {
      setKeypair(existing);
      return existing.publicKey.toBase58();
    }
    const created = await createLocalKeypair();
    setKeypair(created);
    return created.publicKey.toBase58();
  }, [keypair]);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(LOCAL_KEY);
    setKeypair(null);
  }, []);

  const sign = useCallback(
    async (base64: string) => {
      const signer = keypair ?? (await loadLocalKeypair());
      if (!signer) throw new Error("No wallet to sign with");

      setSigning(true);
      try {
        const transaction = Transaction.from(Buffer.from(base64, "base64"));
        // `partialSign`, not `sign`: a launch transaction already carries the
        // signatures of the accounts it creates, and `sign` would discard them.
        transaction.partialSign(signer);
        return transaction.serialize().toString("base64");
      } finally {
        setSigning(false);
      }
    },
    [keypair],
  );

  const value = useMemo<WalletState>(
    () => ({
      address: keypair?.publicKey.toBase58() ?? null,
      mode: "local",
      ready,
      signing,
      sign,
      connect,
      disconnect,
    }),
    [keypair, ready, signing, sign, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside a WalletProvider");
  return context;
}

/**
 * Build, sign and submit in one call.
 *
 * The three steps belong together because the middle one is worthless alone:
 * a signature that is never submitted is not a trade, and a caller that has to
 * remember to submit is a caller that will eventually forget.
 */
export async function signAndSubmit(
  wallet: WalletState,
  built: { transaction: string; window?: { blockhash: string; lastValidBlockHeight: number } },
  poolAddress?: string,
): Promise<string> {
  const signed = await wallet.sign(built.transaction);
  const { signature } = await juno.submit({
    transaction: signed,
    window: built.window,
    poolAddress,
  });
  return signature;
}
