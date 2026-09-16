"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import { rpcEndpoint } from "@/lib/juno/cluster";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet context for the Juno routes.
 *
 * Scoped here rather than in the root layout because the surrounding Norr app
 * has its own unrelated wallet stack (Privy, Algorand); loading both globally
 * would put two competing providers on every page in the repo.
 */
export function JunoWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => rpcEndpoint(), []);
  // Phantom and Solflare both register themselves through the Wallet Standard,
  // so listing them here only guarantees they appear when not yet installed.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
