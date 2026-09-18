"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { planLaunch, sendLaunch, type LaunchRequest } from "@/lib/juno/dbc";
import type { CoinFormat } from "@/lib/juno/types";

export type LaunchResult = {
  /** One per step; the last is the pool init. */
  signatures: string[];
  signature: string;
  pool: string;
  config: string;
  baseMint: string;
};

export type LaunchState =
  | { status: "idle" }
  | { status: "building" }
  | { status: "signing"; label: string; step: number; total: number }
  | { status: "done"; result: LaunchResult }
  | { status: "error"; message: string };

/**
 * Drives a launch from the connected wallet.
 *
 * The status is broken out by phase rather than a single boolean because the
 * slow step is the wallet popup, and "Launching…" for fifteen seconds with no
 * explanation reads as a hang.
 */
export function useLaunch() {
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [state, setState] = useState<LaunchState>({ status: "idle" });

  const launch = useCallback(
    async (
      request: Omit<LaunchRequest, "payer" | "creator" | "uri"> & {
        description?: string;
        format: CoinFormat;
        navFeedId?: string | null;
        /** Gateway URL of already-pinned media, if any. */
        mediaUrl?: string | null;
        /** Still image for thumbnails. For a video, a pinned frame. */
        posterUrl?: string | null;
        mimeType?: string | null;
        mediaWidth?: number | null;
        mediaHeight?: number | null;
      },
    ) => {
      if (!publicKey || !signTransaction) {
        setVisible(true);
        return;
      }

      try {
        setState({ status: "building" });

        // Pin the metadata first. The URI is baked into the mint at creation
        // and the presets renounce update authority, so there is no second
        // chance to attach it — better to fail here than to mint a blank.
        let uri = "";
        try {
          const pinned = await fetch("/api/juno/metadata", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: request.name,
              symbol: request.symbol,
              description: request.description ?? "",
              imageUrl: request.mediaUrl ?? "",
              mimeType: request.mimeType ?? "",
              posterUrl: request.posterUrl ?? "",
              curvePreset: request.preset,
              navFeedId: request.navFeedId ?? "",
            }),
          });
          if (pinned.ok) uri = ((await pinned.json()) as { uri: string }).uri;
        } catch {
          // A pin failure must not strand a creator mid-launch; the coin is
          // still tradeable, it just renders unnamed in third-party wallets.
        }

        const plan = await planLaunch({
          ...request,
          uri,
          payer: publicKey,
          creator: publicKey,
        });

        // Two transactions: the config, then the pool that references it.
        // Each needs its own signature, so the label says which one is
        // waiting rather than leaving a second popup unexplained.
        const signatures = await sendLaunch({
          plan,
          payer: publicKey,
          signTransaction,
          onStep: ({ index, total, label }) =>
            setState({ status: "signing", label, step: index + 1, total }),
        });

        // Record it only after the chain has confirmed. The endpoint re-reads
        // the pool before writing, so a failure here costs the index entry,
        // never the pool itself — which exists regardless.
        try {
          await fetch("/api/juno/pools", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              baseMint: plan.baseMint.toBase58(),
              poolAddress: plan.pool.toBase58(),
              configAddress: plan.config.toBase58(),
              quoteMint: request.quote.mint,
              creatorWallet: publicKey.toBase58(),
              name: request.name,
              symbol: request.symbol,
              description: request.description ?? null,
              format: request.format,
              curvePreset: request.preset,
              navFeedId: request.navFeedId ?? null,
              mediaUrl: request.mediaUrl ?? null,
              posterUrl: request.posterUrl ?? null,
              mediaMime: request.mimeType ?? null,
              mediaWidth: request.mediaWidth ?? null,
              mediaHeight: request.mediaHeight ?? null,
              createSignature: signatures[signatures.length - 1],
            }),
          });
        } catch {
          // Indexing is best-effort; the receipt below still links to chain.
        }

        setState({
          status: "done",
          result: {
            signatures,
            signature: signatures[signatures.length - 1],
            pool: plan.pool.toBase58(),
            config: plan.config.toBase58(),
            baseMint: plan.baseMint.toBase58(),
          },
        });
      } catch (error) {
        setState({
          status: "error",
          message: describeError(error),
        });
      }
    },
    [publicKey, signTransaction, setVisible],
  );

  return { state, launch, reset: () => setState({ status: "idle" }) };
}

/**
 * Wallet and RPC errors are not written for humans. Translate the ones that
 * actually happen, and pass anything else through rather than swallowing it.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/User rejected|rejected the request/i.test(message)) {
    return "You rejected the transaction.";
  }
  if (/insufficient lamports|Attempt to debit an account/i.test(message)) {
    return "Not enough SOL to cover rent and fees for the new accounts.";
  }
  if (/blockhash not found|block height exceeded/i.test(message)) {
    return "The transaction expired before it confirmed. Try again.";
  }
  if (/429|Too Many Requests/i.test(message)) {
    return "The RPC endpoint is rate-limiting. Set NEXT_PUBLIC_SOLANA_RPC to a dedicated endpoint.";
  }
  return message;
}
