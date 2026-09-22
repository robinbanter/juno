"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { tokenAmount, usd } from "@/lib/juno/format";
import type { Coin } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { buttonClass } from "../ui/Button";
import { Delta } from "../ui/Delta";

const PRESETS = [2, 20, 50, 100];

/**
 * The buy surface for a reel.
 *
 * Deliberately not the full `TradePanel`: someone buying mid-scroll wants an
 * amount and a confirm, not a fee breakdown and four tabs. Everything omitted
 * here is one tap away on the coin page.
 */
export function QuickBuySheet({
  coin,
  onClose,
}: {
  coin: Coin | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(20);

  // Escape closes, and the body must not scroll behind an open sheet.
  useEffect(() => {
    if (!coin) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [coin, onClose]);

  if (!coin) return null;

  /*
   * What this buys at the price on screen — an approximation, labelled.
   *
   * This divides an amount by the spot price, which is a straight line through
   * a bonding curve. It is close for a small buy and progressively wrong for a
   * large one, and it does not include the fee. The sheet used to print it as
   * a flat "You receive" figure under a footnote claiming it "quotes price
   * against the live curve" — a claim it never made good on, because quoting
   * the curve needs the pool snapshot this sheet never reads.
   *
   * Rather than pull the whole trade machinery into a scroll-by sheet, the
   * figure says it is approximate and the real quote lives one tap away on the
   * coin page, where the curve actually gets asked.
   */
  const approximate = coin.priceUsd > 0 ? amount / coin.priceUsd : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Buy ${coin.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-[420px] rounded-t-2xl border border-j-line bg-j-bg p-5 pb-8 sm:rounded-2xl sm:pb-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-j-muted transition-colors hover:bg-j-surface hover:text-j-ink"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2.5">
          <Avatar src={coin.creator.avatarUrl} alt={coin.creator.handle} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold">{coin.name}</p>
            <p className="text-[14px] text-j-muted">{coin.creator.handle}</p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />
          <span className="text-[12px] text-j-faint">
            {Math.round(coin.curve.progress * 100)}% to graduation
          </span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              className={cn(
                "h-11 rounded-j border text-[14px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                amount === preset
                  ? "border-j-ink bg-j-ink text-j-bg"
                  : "border-j-line-strong text-j-ink hover:bg-j-surface",
              )}
            >
              ${preset}
            </button>
          ))}
        </div>

        <dl className="mt-4 flex items-center justify-between text-[14px]">
          <dt className="text-j-muted">Roughly</dt>
          <dd className="font-semibold tabular-nums">
            {approximate === null ? (
              <span className="text-j-faint">&mdash;</span>
            ) : (
              <>
                ≈ {tokenAmount(approximate)} {coin.symbol}
              </>
            )}
          </dd>
        </dl>

        {/*
          The sheet does not trade. It used to present a full-width "Buy $20"
          that was wired to nothing whatsoever — the primary control on the
          surface, dead on arrival, directly above a line promising a quote
          against the live curve. It opens the coin page, which has the real
          quote, the real impact figure and the wallet flow.
        */}
        <Link href={`/coin/${coin.address}`} className={buttonClass("buy", "lg", "mt-4 w-full")}>
          Buy {usd(amount)}
        </Link>

        <p className="mt-3 text-center text-[12px] text-j-faint">
          An estimate at the current price — it does not include price impact or
          fees. The coin page quotes the curve itself.
        </p>
      </div>
    </div>
  );
}
