"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Coins, Copy, DollarSign, Flame, MoreHorizontal, Share } from "lucide-react";

import { CURVE_PRESETS } from "@/lib/juno/curves";
import { compact, money } from "@/lib/juno/format";
import type { Coin } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/Button";
import { Delta } from "../ui/Delta";
import { Pill } from "../ui/Pill";
import { StatCards } from "../ui/StatCards";
import { CurveChart } from "./CurveChart";
import { CurveProgress } from "./CurveProgress";
import { NavPanel } from "./NavPanel";

/** Everything above the trade panel: who made it, what it is, how it's doing. */
export function CoinSummary({ coin }: { coin: Coin }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/creator/${coin.creator.handle}`}
          className="flex min-w-0 items-center gap-2 rounded-full transition-opacity hover:opacity-70"
        >
          <Avatar src={coin.creator.avatarUrl} alt={coin.creator.displayName} size={24} />
          <span className="truncate text-[14px] font-medium">{coin.creator.handle}</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {coin.holders !== null && (
            <span className="text-[13px] text-j-muted">
              {compact(coin.holders, 1)} holders
            </span>
          )}
          <IconButton label="Share" className="size-9 border-0">
            <Share size={17} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="More options" className="size-9 border-0">
            <MoreHorizontal size={17} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <div>
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-tight">{coin.name}</h1>
        {coin.description && (
          <p className="mt-2 text-[14px] leading-[1.5] whitespace-pre-line text-j-ink">
            {coin.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill icon={<DollarSign size={13} className="text-j-muted" />}>{coin.symbol}</Pill>
        <CopyAddress address={coin.address} />
      </div>

      <StatCards
        items={[
          {
            label: "Market Cap",
            value: <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />,
          },
          {
            label: "24H Volume",
            value: money(coin.volume24h, coin.marketCapCurrency),
            icon: <Flame size={13} className="text-j-muted" aria-hidden="true" />,
          },
          {
            label: "Creator Rewards",
            value: money(coin.creatorRewards, coin.marketCapCurrency),
            icon: <Coins size={13} className="text-j-muted" aria-hidden="true" />,
          },
        ]}
      />

      {/* Only an equity-shaped launch has a net asset value to sit against. */}
      {coin.nav && <NavPanel nav={coin.nav} />}

      {coin.curve.graduated ? (
        <p className="rounded-j bg-j-surface px-3 py-2 text-[13px] text-j-muted">
          Graduated — this coin now trades in a Meteora DAMM v2 pool.
        </p>
      ) : (
        <CurveProgress curve={coin.curve} />
      )}

      {/* The sixteen segments the issuer actually chose. Wide, flat stretches
          are heavily weighted liquidity; narrow, steep ones are thin. */}
      {coin.shape && coin.shape.points.length > 0 && (
        <div className="rounded-j border border-j-line p-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[12px] font-semibold">
              {CURVE_PRESETS[coin.curvePreset]?.label ?? "Curve"}
            </span>
            <span className="text-[11px] text-j-faint">
              {coin.shape.points.length} segments
            </span>
          </div>
          <CurveChart shape={coin.shape} progress={coin.curve.progress} height={120} />
          <p className="mt-1 text-[11px] leading-snug text-j-faint">
            {CURVE_PRESETS[coin.curvePreset]?.tagline}
          </p>
        </div>
      )}
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Pill
      icon={
        copied ? (
          <Check size={13} className="text-j-pos" />
        ) : (
          <Copy size={13} className="text-j-muted" />
        )
      }
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard is blocked without a user gesture in some browsers;
          // the address is still visible in the Details tab.
        }
      }}
      title={address}
    >
      {copied ? "Copied" : "Copy address"}
    </Pill>
  );
}
