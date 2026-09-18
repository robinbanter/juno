"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { cn } from "@/lib/utils";
import { explorer } from "@/lib/juno/cluster";
import { quoteTrade, type TradeQuote } from "@/lib/juno/dbc";
import { quoteAmount, tokenAmount, usd } from "@/lib/juno/format";
import type { Coin } from "@/lib/juno/types";
import { useTrade } from "../wallet/useTrade";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Delta } from "../ui/Delta";

/**
 * Preset spends, in the pool's own quote token. A SOL pool is bought with SOL,
 * so its presets are SOL amounts — "$20" on a SOL pool would have been twenty
 * SOL, a mislabel of roughly 150x.
 */
const PRESETS: Record<"SOL" | "USDC", number[]> = {
  SOL: [0.1, 0.5, 1, 5],
  USDC: [2, 20, 50, 100],
};

/**
 * The buy surface for a reel.
 *
 * Deliberately not the full `TradePanel`: someone buying mid-scroll wants an
 * amount and a confirm, not a fee breakdown and four tabs. It is the same
 * trade, though — `useTrade` and the live DBC quoter, exactly as on the coin
 * page — so what it shows is what the wallet will be asked to sign.
 */
export function QuickBuySheet({
  coin,
  onClose,
}: {
  coin: Coin | null;
  onClose: () => void;
}) {
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
  // Keyed by coin so a new reel starts from a clean trade state.
  return <Sheet key={coin.address} coin={coin} onClose={onClose} />;
}

function Sheet({ coin, onClose }: { coin: Coin; onClose: () => void }) {
  const { setVisible } = useWalletModal();
  const { ensureSnapshot, balanceUsd, state, swap, connected } = useTrade(coin);
  const quoteSymbol = coin.quote.symbol === "SOL" ? "SOL" : "USDC";
  const presets = PRESETS[quoteSymbol];
  const [amount, setAmount] = useState(presets[1]);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // A fresh quote for every amount, against the live curve. Cleared first so
  // a buy can never be sent with the minimum computed for another amount.
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    const timer = setTimeout(async () => {
      try {
        const snapshot = await ensureSnapshot();
        if (!snapshot) throw new Error("Pool is not readable right now.");
        const next = await quoteTrade({ snapshot, side: "buy", amountIn: amount, slippageBps: 100 });
        if (!cancelled) setQuote(next);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not price this trade";
        setQuoteError(
          /insufficient liquidity/i.test(message)
            ? "More than this curve can fill — pick a smaller amount"
            : message,
        );
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount, ensureSnapshot]);

  const spend = (value: number) => (quoteSymbol === "SOL" ? `${quoteAmount(value)} SOL` : usd(value));
  const busy = state.status === "signing" || state.status === "confirming";
  const overBalance = connected && amount > balanceUsd;

  const label = !connected
    ? "Connect wallet to buy"
    : busy
      ? state.status === "signing"
        ? "Approve in your wallet…"
        : "Confirming…"
      : overBalance
        ? "Insufficient balance"
        : quoteError
          ? "Can’t buy this amount"
          : !quote
            ? "Getting a price…"
            : `Buy ${spend(amount)}`;

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
            <p className="truncate text-[15px] font-semibold">{coin.name}</p>
            <p className="text-[13px] text-j-muted">{coin.creator.handle}</p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <Delta value={coin.marketCap} direction={coin.marketCapChangePct} currency={coin.marketCapCurrency} />
          <span className="text-[12px] text-j-faint">
            {Math.round(coin.curve.progress * 100)}% to graduation
          </span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(preset)}
              aria-pressed={amount === preset}
              className={cn(
                "h-11 rounded-j border text-[14px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                amount === preset
                  ? "border-j-ink bg-j-ink text-j-bg"
                  : "border-j-line-strong text-j-ink hover:bg-j-surface",
              )}
            >
              {spend(preset)}
            </button>
          ))}
        </div>

        <dl className="mt-4 flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-j-muted">You receive</dt>
            <dd className="font-semibold tabular-nums">
              {quote ? `${tokenAmount(quote.amountOut)} ${coin.symbol}` : "—"}
            </dd>
          </div>
          {connected && (
            <div className="flex items-center justify-between">
              <dt className="text-j-muted">Balance</dt>
              <dd className="tabular-nums">{spend(balanceUsd)}</dd>
            </div>
          )}
          {quoteError && (
            <div className="flex items-center justify-between">
              <dt className="text-j-muted">Quote</dt>
              <dd className="text-j-danger">{quoteError}</dd>
            </div>
          )}
        </dl>

        <Button
          variant="buy"
          size="lg"
          className="mt-4 w-full"
          disabled={connected && (busy || overBalance || !quote)}
          onClick={() => {
            if (!connected) return setVisible(true);
            if (!quote) return;
            void swap({ side: "buy", amountIn: amount, minimumAmountOut: quote.minimumAmountOut });
          }}
        >
          {label}
        </Button>

        {state.status === "error" && (
          <p role="alert" className="mt-3 text-center text-[13px] text-j-danger">
            {state.message}
          </p>
        )}
        {state.status === "done" && (
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px]">
            <span className="font-semibold text-j-pos">Bought</span>
            <a
              href={explorer.tx(state.signature)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-j-muted hover:text-j-ink"
            >
              View tx
              <ExternalLink size={11} />
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
