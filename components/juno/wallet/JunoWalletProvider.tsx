"use client";

import { useCallback, useMemo, type ComponentProps } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import { rpcEndpoint } from "@/lib/juno/cluster";

// Vendored copy, not the upstream file — see the header of ./wallet-adapter.css.
import "./wallet-adapter.css";

// The adapter's error type, taken from the provider itself rather than from
// @solana/wallet-adapter-base, which is not a direct dependency.
type WalletError = Parameters<NonNullable<ComponentProps<typeof WalletProvider>["onError"]>>[0];

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

  // Without this the provider's default handler console.errors every wallet
  // error, including a user pressing Reject, while the call site that asked
  // for the signature has already caught it and shown it in the UI. A refusal
  // is an answer, not a fault; anything else is kept, as a warning.
  const onError = useCallback((error: WalletError) => {
    if (/reject|cancel|denied/i.test(`${error.message} ${error.error?.message ?? ""}`)) return;
    console.warn(`[wallet] ${error.name}: ${error.message}`);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
