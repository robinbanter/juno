import type { Metadata } from "next";

import { JunoShell } from "@/components/juno/JunoShell";

export const metadata: Metadata = {
  title: {
    default: "Juno — every post is a market",
    template: "%s · Juno",
  },
  description:
    "Coin your posts on Solana. Every Juno post launches a Meteora Dynamic Bonding Curve pool that graduates into DAMM v2 liquidity.",
};

export default function JunoLayout({ children }: { children: React.ReactNode }) {
  return <JunoShell>{children}</JunoShell>;
}
