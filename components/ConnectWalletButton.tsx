"use client";

import { WalletButton } from "@txnlab/use-wallet-ui-react";
import { useWallet } from "@txnlab/use-wallet-react";

/**
 * Connect-wallet button backed by the Privy embedded Algorand wallet.
 *
 * - Default (e.g. the sign-in screen): always renders, showing "Connect Wallet"
 *   until a wallet is active, then the connected address.
 * - `connectedOnly` (e.g. the app header): renders nothing until a wallet is
 *   actually connected, then shows the connected address — so a signed-in user
 *   never sees a redundant "Connect Wallet" next to their balance.
 */
export function ConnectWalletButton({
  connectedOnly = false,
}: {
  connectedOnly?: boolean;
}) {
  const { activeAddress } = useWallet();
  if (connectedOnly && !activeAddress) return null;

  return (
    <div className="wui-custom-trigger">
      <WalletButton />
    </div>
  );
}
