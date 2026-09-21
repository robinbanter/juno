"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { feedLabel } from "./NavPanel";
import { percent, quoteAmount, tokenAmount, usd } from "@/lib/juno/format";
import type { Coin, QuoteToken, TradeSide } from "@/lib/juno/types";
import { Button } from "../ui/Button";
import { TokenSelect } from "./TokenSelect";

/** Buys are sized in dollars. */
const BUY_PRESETS = [2, 20, 50, 100];
/** Sells are sized as a share of what you hold — dollar amounts are meaningless. */
const SELL_PRESETS = [0.25, 0.5, 0.75, 1];

/** Quote tokens that are 1:1 with USD, so no price feed is needed. */
const STABLES = new Set(["USDC", "USDT", "PYUSD"]);

export type TradeQuoteResult = {
  /** Coins received on a buy, quote received on a sell — UI units. */
  amountOut: number;
  minimumAmountOut: number;
  /** Quote-denominated fee. */
  fee: number;
  /** Ratio, e.g. 0.012 for 1.2%. */
  priceImpact: number;
};

export function TradePanel({
  coin,
  quoteTokens,
  balanceUsd = 0,
  holding = 0,
  connected = false,
  quotePricesUsd,
  networkFeeUsd,
  onQuote,
  onSubmit,
  submitting = false,
  className,
}: {
  coin: Coin;
  quoteTokens: QuoteToken[];
  /** Spendable quote-token balance, in USD. Governs buys. */
  balanceUsd?: number;
  /** Coin balance in UI units. Governs sells. */
  holding?: number;
  /**
   * Whether a wallet is connected. Drives whether the CTA offers to connect
   * or reports a shortfall — without it, every logged-out visitor would be
   * told they have insufficient funds, which is not the problem they have.
   */
  connected?: boolean;
  /** USD price per unit of each quote token, keyed by mint. */
  quotePricesUsd?: Record<string, number>;
  /** Undefined renders the fee as still loading. */
  networkFeeUsd?: number;
  /**
   * Price the trade against the live curve. Debounced here, so an
   * implementation can call the DBC quoter directly.
   *
   * `amountIn` is in the input token's UI units — quote units on a buy, base
   * units on a sell. That is the same convention `quoteTrade` in
   * `lib/juno/dbc.ts` uses, so the two cannot drift apart.
   */
  onQuote?: (input: {
    side: TradeSide;
    amountIn: number;
    token: QuoteToken;
  }) => Promise<TradeQuoteResult | null>;
  onSubmit?: (input: {
    side: TradeSide;
    amountIn: number;
    token: QuoteToken;
    comment: string;
    quote: TradeQuoteResult | null;
  }) => void;
  submitting?: boolean;
  className?: string;
}) {
  const [side, setSide] = useState<TradeSide>("buy");
  const [buyAmount, setBuyAmount] = useState("20");
  const [sellAmount, setSellAmount] = useState("");
  // Default to the pool's own quote mint. Anything else has to be routed, and
  // opening on a token the pool does not accept misstates what a buy costs.
  const [token, setToken] = useState<QuoteToken>(
    () => quoteTokens.find((t) => t.mint === coin.quote.mint) ?? coin.quote,
  );
  const [comment, setComment] = useState("");
  const [quote, setQuote] = useState<TradeQuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);

  const buying = side === "buy";
  const raw = buying ? buyAmount : sellAmount;
  const amountIn = Number(raw) || 0;
  const amountId = useId();

  // Only a connected wallet can be short; a disconnected one has nothing to
  // compare against yet.
  const overBalance =
    connected && (buying ? amountIn > balanceUsd : amountIn > holding);

  const quotePrice =
    quotePricesUsd?.[token.mint] ?? (STABLES.has(token.symbol) ? 1 : 0);

  // Quote requests race; only the newest is allowed to land.
  const requestRef = useRef(0);
  useEffect(() => {
    if (!onQuote || amountIn <= 0) {
      setQuote(null);
      return;
    }
    const id = ++requestRef.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await onQuote({ side, amountIn, token });
        if (id === requestRef.current) setQuote(result);
      } finally {
        if (id === requestRef.current) setQuoting(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [onQuote, side, amountIn, token]);

  // Secondary read-out under the field: the quote-token amount on a buy, the
  // dollar value on a sell.
  const echo = useMemo(() => {
    if (amountIn <= 0) return "0";
    if (buying) {
      // Dollar equivalent, only where one is actually known.
      return quotePrice > 0 ? `≈ ${usd(amountIn * quotePrice)}` : "—";
    }
    return coin.priceUsd > 0 ? `≈ ${usd(amountIn * coin.priceUsd)}` : "—";
  }, [amountIn, buying, quotePrice, coin.priceUsd]);

  const estimated =
    quote?.amountOut ??
    (buying
      ? coin.priceUsd > 0
        ? amountIn / coin.priceUsd
        : 0
      : amountIn * coin.priceUsd);

  function setAmount(next: string) {
    if (next !== "" && !/^\d*\.?\d*$/.test(next)) return;
    if (buying) setBuyAmount(next);
    else setSellAmount(next);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="tablist" aria-label="Trade side" className="flex items-center gap-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "h-9 rounded-full px-4 text-[14px] font-semibold capitalize transition-colors",
              "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
              side === s
                ? s === "buy"
                  ? "bg-j-pos text-j-bg"
                  : "bg-j-neg text-j-bg"
                : "text-j-muted hover:text-j-ink",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "rounded-j-lg border bg-j-input px-4 py-3 transition-colors",
          overBalance ? "border-j-danger" : "border-j-line",
        )}
      >
        <div className="flex items-center gap-3">
          <label htmlFor={amountId} className="sr-only">
            {buying ? `Amount in ${token.symbol}` : `Amount of ${coin.symbol} to sell`}
          </label>

          <div className="flex min-w-0 flex-1 items-center">
            {/* Only stablecoin pools are denominated in dollars; a SOL pool
                showing "$20" would misstate what is being spent. */}
            {buying && STABLES.has(token.symbol) && (
              <span
                className={cn(
                  "text-[26px] leading-none font-semibold",
                  overBalance ? "text-j-danger" : "text-j-ink",
                )}
              >
                $
              </span>
            )}
            <input
              id={amountId}
              inputMode="decimal"
              value={raw}
              placeholder={buying ? "" : "0"}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(
                "w-full min-w-0 bg-transparent text-[26px] leading-none font-semibold tabular-nums outline-none placeholder:text-j-faint",
                overBalance ? "text-j-danger" : "text-j-ink",
              )}
            />
          </div>

          {/* You pay with a quote token, but you sell the coin itself — so the
              selector only applies to buys. */}
          {buying ? (
            <TokenSelect
              value={token}
              options={quoteTokens}
              onChange={setToken}
              poolQuoteMint={coin.quote.mint}
            />
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-j-line-strong bg-j-surface py-1.5 pr-3 pl-2 text-[14px] font-semibold">
              <CoinMark coin={coin} />
              <span className="max-w-[90px] truncate">{coin.symbol}</span>
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[14px] text-j-muted">
          <span className="tabular-nums">{echo}</span>
          <span>
            {buying
              ? `Balance: ${STABLES.has(token.symbol) ? usd(balanceUsd) : `${quoteAmount(balanceUsd)} ${token.symbol}`}`
              : `Holding: ${tokenAmount(holding)}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {buying
          ? BUY_PRESETS.map((preset) => (
              <PresetButton
                key={preset}
                active={amountIn === preset}
                onClick={() => setBuyAmount(String(preset))}
              >
                ${preset}
              </PresetButton>
            ))
          : SELL_PRESETS.map((share) => (
              <PresetButton
                key={share}
                // Selling a share you do not hold is not a meaningful action.
                disabled={holding <= 0}
                active={holding > 0 && Math.abs(amountIn - holding * share) < 1e-9}
                onClick={() => setSellAmount(String(holding * share))}
              >
                {share === 1 ? "Max" : `${share * 100}%`}
              </PresetButton>
            ))}
      </div>

      <dl className="flex flex-col gap-1.5 text-[14px]">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1 text-j-muted">
            Network fee
            <Info size={13} className="text-j-faint" aria-hidden="true" />
          </dt>
          <dd>
            {networkFeeUsd === undefined ? (
              <span className="block h-3.5 w-14 animate-pulse rounded bg-j-surface" />
            ) : (
              <span className="tabular-nums">{usd(networkFeeUsd)}</span>
            )}
          </dd>
        </div>

        <div className="flex items-center justify-between">
          <dt className="text-j-muted">You receive</dt>
          <dd className="flex items-center gap-1.5">
            {buying && <CoinMark coin={coin} />}
            <span
              className={cn(
                "font-semibold tabular-nums",
                quoting && "opacity-50 transition-opacity",
              )}
            >
              {buying ? tokenAmount(estimated) : usd(estimated)}
            </span>
          </dd>
        </div>

        {quote && quote.priceImpact > 0.02 && (
          <div className="flex items-center justify-between">
            <dt className="text-j-muted">Price impact</dt>
            <dd className="font-semibold tabular-nums text-j-danger">
              {(quote.priceImpact * 100).toFixed(1)}%
            </dd>
          </div>
        )}
      </dl>

      <NavBandWarning coin={coin} quote={quote} buying={buying} />

      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        aria-label="Add a comment to your trade"
        maxLength={280}
        className="h-11 w-full rounded-j border border-j-line bg-j-input px-3.5 text-[14px] placeholder:text-j-faint focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
      />

      <Button
        variant={buying ? "buy" : "sell"}
        size="lg"
        disabled={submitting || amountIn <= 0 || overBalance}
        onClick={() => onSubmit?.({ side, amountIn, token, comment, quote })}
        className="w-full"
      >
        {submitting
          ? "Confirming…"
          : overBalance
            ? buying
              ? "Insufficient balance"
              : `Not enough ${coin.symbol}`
            : buying
              ? "Buy"
              : "Sell"}
      </Button>
    </div>
  );
}

function PresetButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-j border text-[14px] font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-j-ink bg-j-ink text-j-bg"
          : "border-j-line-strong text-j-ink hover:bg-j-surface",
      )}
    >
      {children}
    </button>
  );
}

function CoinMark({ coin }: { coin: Coin }) {
  return (
    <span className="size-4 shrink-0 overflow-hidden rounded-[4px] bg-j-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coin.media.posterUrl ?? coin.media.url}
        alt=""
        className="size-full object-cover"
      />
    </span>
  );
}

/**
 * Warn before a trade walks the price out of the preset's NAV band.
 *
 * Only equity-shaped presets have a band, and only pools launched against a
 * Pyth feed have a reference to measure against, so on a content coin this
 * renders nothing — a photo has no net asset value to deviate from.
 *
 * The post-trade price comes from the quoter's own price impact rather than a
 * second simulation: impact *is* the move this trade would cause, and reusing it
 * keeps the warning consistent with the number shown directly above it.
 *
 * This informs, it does not block. The band is the issuer's stated intent, not a
 * rule the program enforces, and a UI that refused the trade would be claiming
 * an authority it does not have.
 */
function NavBandWarning({
  coin,
  quote,
  buying,
}: {
  coin: Coin;
  quote: TradeQuoteResult | null;
  buying: boolean;
}) {
  const nav = coin.nav;
  if (!nav || !quote || coin.priceUsd <= 0 || nav.priceUsd <= 0) return null;

  // A buy walks the curve up, a sell walks it down.
  const after = coin.priceUsd * (buying ? 1 + quote.priceImpact : 1 - quote.priceImpact);
  const deviation = (after - nav.priceUsd) / nav.priceUsd;
  const breaches = Math.abs(deviation) * 10_000 > nav.bandBps;

  // Already outside and getting worse is worth saying; already outside and
  // coming back is the trade the band wants to encourage.
  if (!breaches) return null;
  if (!nav.withinBand && Math.abs(deviation) <= Math.abs(nav.deviation)) return null;

  return (
    <p
      role="status"
      className="rounded-j border border-j-neg/40 bg-j-neg/10 px-3 py-2 text-[12px] leading-snug text-j-ink"
    >
      This trade would put {coin.symbol} {percent(deviation)} against{" "}
      {feedLabel(nav.feed)}
      {nav.state === "closed" ? "'s last close" : ""} — outside the{" "}
      {nav.bandBps / 100}% band this issuance was launched with.
    </p>
  );
}
