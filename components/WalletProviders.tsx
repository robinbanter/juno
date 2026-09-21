"use client";

import {
  NetworkId,
  WalletId,
  WalletManager,
  WalletProvider,
  type SupportedWallet,
} from "@txnlab/use-wallet-react";
import { WalletUIProvider } from "@txnlab/use-wallet-ui-react";
import { PrivyProvider } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import "@txnlab/use-wallet-ui-react/dist/style.css";
import { privyWalletProvider } from "@/lib/privyWallet";
import { PrivyBridge } from "@/components/PrivyBridge";
import { PrivySessionSync } from "@/components/PrivySessionSync";
import { isJunoRoute } from "@/lib/juno/routes";

const PRIVY_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzY5NjdmZiI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiByeD0iNiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iOS41IiByPSIzLjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNNi41IDE4YzAtMyAyLjUtNC44IDUuNS00LjhTMTcuNSAxNSAxNy41IDE4eiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// All the Algorand wallets a user can connect: the standard browser/mobile
// connectors plus the Privy embedded wallet (a Solana ed25519 key re-encoded as
// an Algorand address by lib/privyWallet.ts). Pera/Defly/Exodus/Kibisis/Lute
// work with no config. (Biatec/WalletConnect are omitted because they require a
// WalletConnect projectId; add them once NEXT_PUBLIC_WC_PROJECT_ID is set.)
const baseWallets: SupportedWallet[] = [
  WalletId.PERA,
  WalletId.DEFLY,
  WalletId.EXODUS,
  WalletId.KIBISIS,
  { id: WalletId.LUTE, options: { siteName: "Norr" } },
];

// Only register Privy when it's actually configured — otherwise clicking it in
// the picker would hang on a login bridge that never mounts (no PrivyProvider).
const privyWallet: SupportedWallet = {
  id: WalletId.CUSTOM,
  options: { provider: privyWalletProvider },
  metadata: { name: "Privy", icon: PRIVY_ICON },
};

// Follow the same switch the server uses, so a connected wallet is never on a
// different network than the one we settle on. Defaults to TestNet: MainNet
// (real USDC) must be opted into explicitly.
const defaultNetwork =
  process.env.NEXT_PUBLIC_ALGO_NETWORK === "mainnet" ? NetworkId.MAINNET : NetworkId.TESTNET;

const walletManager = new WalletManager({
  wallets: privyAppId ? [...baseWallets, privyWallet] : baseWallets,
  defaultNetwork,
});

/**
 * Wraps the app in the Privy + use-wallet providers so <ConnectWalletButton />
 * (and useWallet()) work anywhere in the tree.
 *
 * If NEXT_PUBLIC_PRIVY_APP_ID is missing we render children untouched instead of
 * throwing, so the app (and its premium UI) never white-screens during dev. The
 * connect button simply won't have a wallet context until the key is set.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  /*
   * Juno is not a tenant of Norr's wallet stack.
   *
   * Norr signs with Algorand wallets through `@txnlab/use-wallet-react` and
   * authenticates through Privy. Juno signs Solana transactions through
   * `@solana/wallet-adapter-react` and mounts its own provider in
   * `app/(juno)/layout.tsx`. The two share no context and no hook.
   *
   * Wrapping Juno in Privy anyway was not merely redundant, it was fatal:
   * `PrivyProvider` holds its subtree until its iframe resolves, and on a
   * domain the Privy dashboard does not list the iframe never does —
   * "Exceeded max attempts before resolving function". The whole Juno page
   * then renders from the server and never hydrates, so every tab, every
   * toggle and every button on it is inert while looking perfectly fine.
   * That is how the coin page came to paint a complete trading UI in which
   * nothing could be clicked.
   *
   * `isJunoRoute` is the same switch `AgeGate` uses to stand down, for the
   * same reason: one app, two products, and Norr's chrome does not belong on
   * Juno's side of it.
   */
  const pathname = usePathname();
  if (isJunoRoute(pathname)) return <>{children}</>;

  // The use-wallet context is always mounted so <ConnectWalletButton /> (which
  // calls useWallet) has a provider anywhere in the tree, key or not.
  const walletTree = (
    <WalletProvider manager={walletManager}>
      <WalletUIProvider>{children}</WalletUIProvider>
    </WalletProvider>
  );

  // Without a Privy App ID we skip the Privy layer entirely: the button still
  // renders, but the Privy connector can't authenticate until the key is set.
  if (!privyAppId) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[WalletProviders] Missing NEXT_PUBLIC_PRIVY_APP_ID — Privy login is disabled. " +
          "Add it to .env.local (get one at https://dashboard.privy.io).",
      );
    }
    return walletTree;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        // Email + every social login. `primary` renders as buttons (email leads,
        // since it shows an input); the rest sit under "more options" (overflow).
        // In Privy's API, X is 'twitter'. NOTE: each provider must ALSO be enabled
        // in the Privy dashboard (Login methods) for this app, or it errors on click.
        loginMethodsAndOrder: {
          primary: ["email", "google", "twitter", "github"],
          overflow: ["discord", "apple", "linkedin", "tiktok", "farcaster", "spotify"],
        },
        // Auto-provision an embedded Solana (ed25519) wallet on login — the
        // keypair we re-encode into an Algorand address and sign txns with.
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
        appearance: {
          walletChainType: "solana-only",
        },
      }}
    >
      <WalletProvider manager={walletManager}>
        <WalletUIProvider>
          <PrivyBridge />
          <PrivySessionSync />
          {children}
        </WalletUIProvider>
      </WalletProvider>
    </PrivyProvider>
  );
}
