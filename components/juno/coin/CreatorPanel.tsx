"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight } from "lucide-react";

import type { Coin } from "@/lib/juno/types";

/**
 * The creator's way into their pool's Manage view.
 *
 * Only rendered for the wallet that created the coin. The claim and
 * migration themselves live on `/coin/[address]/manage`, next to the monitor
 * that tells a creator whether either is worth doing.
 */
export function CreatorPanel({ coin }: { coin: Coin }) {
  const { publicKey } = useWallet();
  if (publicKey?.toBase58() !== coin.creator.wallet) return null;

  return (
    <Link
      href={`/coin/${coin.address}/manage`}
      className="mt-4 flex items-center justify-between rounded-j border border-j-line p-4 transition-colors hover:bg-j-surface"
    >
      <span>
        <span className="block text-[14px] font-semibold">You created this</span>
        <span className="block text-[12px] text-j-muted">
          Monitor the curve and fee decay, claim fees, graduate to DAMM v2.
        </span>
      </span>
      <span className="flex items-center gap-1 text-[13px] font-semibold">
        Manage pool
        <ArrowRight size={14} />
      </span>
    </Link>
  );
}
