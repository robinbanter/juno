"use client";

/**
 * Legacy wallet wrapper.
 * Juno uses JunoWalletProvider exclusively (pure Solana @solana/wallet-adapter).
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
