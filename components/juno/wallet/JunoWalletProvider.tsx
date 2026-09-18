"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import { rpcEndpoint } from "@/lib/juno/cluster";

// Vendored copy, not the upstream file — see the header of ./wallet-adapter.css.
import "./wallet-adapter.css";

/**
 * Solana wallet context for the Juno routes.
 *
 * Scoped to the `(juno)` route group rather than the root layout. The adapter
 * pulls in a wallet bundle per connector, so mounting it globally would load
 * all of that on routes that never ask for a signature.
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
