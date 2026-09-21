import type { Metadata, Viewport } from "next";

import { JunoShell } from "@/components/juno/JunoShell";
import { JunoWalletProvider } from "@/components/juno/wallet/JunoWalletProvider";

/**
 * The browser's own chrome, told which app it is framing.
 *
 * The root layout sets `themeColor: "#000000"` for Norr, and a route group's
 * viewport overrides it. Without this the address bar and status-bar area on
 * iOS and Android went black above a sage page -- the first thing anyone sees
 * on the phone, and the one part of the light theme a screenshot of the
 * content never shows.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#d3e3cb",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: {
    default: "Juno — every post is a market",
    template: "%s · Juno",
  },
  description:
    "Coin your posts on Solana. Every Juno post launches a Meteora Dynamic Bonding Curve pool that graduates into DAMM v2 liquidity.",
};

export default function JunoLayout({ children }: { children: React.ReactNode }) {
  return (
    <JunoWalletProvider>
      <JunoShell>{children}</JunoShell>
    </JunoWalletProvider>
  );
}
