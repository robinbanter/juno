"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { percent, quoteAmount, tokenAmount, usd } from "@/lib/juno/format";
import { quoteAgainstNav, type NavContext } from "@/lib/juno/nav";
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
  nav = null,
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
  /**
   * The pool's Pyth reference and band. When present, every quote is checked
   * against it and a fill outside the band is called out before signing.
   */
  nav?: NavContext | null;
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
  /** Why the last quote failed — e.g. more than the curve has left to sell. */
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // The quoter threw or returned nothing (usually an RPC 429). Distinct from
  // "not asked yet", so the button can say what happened and offer a retry.
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [quoteAttempt, setQuoteAttempt] = useState(0);

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
  //
  // The quote is cleared the moment any input changes, not when the new one
  // arrives. The quote carries `minimumAmountOut` — the only slippage guard a
  // swap has — and keeping the previous one on screen meant typing 20, then
  // 200, then clicking within the debounce sent 200 with a minimum computed
  // for 20: a guard roughly ten times too weak.
  const requestRef = useRef(0);
  useEffect(() => {
    setQuote(null);
    setQuoteFailed(false);
    setQuoteError(null);
    if (!onQuote || amountIn <= 0) {
      setQuoting(false);
      return;
    }
    const id = ++requestRef.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const result = await onQuote({ side, amountIn, token });
        if (id === requestRef.current) {
          setQuote(result);
          setQuoteFailed(result === null);
          setQuoteError(null);
        }
      } catch (error) {
        // Previously uncaught: an RPC 429 inside the quoter surfaced as an
        // unhandled promise rejection on every coin page view. The quoter also
        // throws when the trade cannot fill at all; keep its reason to show.
        if (id === requestRef.current) {
          setQuoteFailed(true);
          setQuoteError(error instanceof Error ? error.message : "Could not price this trade");
        }
      } finally {
        if (id === requestRef.current) setQuoting(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [onQuote, side, amountIn, token, quoteAttempt]);

  // A connected wallet can only trade against a fresh quote for exactly these
  // inputs. Without one there is no minimum-out to send, and the DBC program
  // fills a swap with minimumAmountOut = 0 at any price — verified by
  // simulation. (Disconnected visitors keep the button: it opens the wallet.)
  const needsQuote = connected && amountIn > 0 && !quote;

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

  // A trade the quoter refused has no honest "you receive" figure.
  const estimated = quoteError
    ? Number.NaN
    : quote?.amountOut ??
    (buying
      ? coin.priceUsd > 0
        ? amountIn / coin.priceUsd
        : 0
      : amountIn * coin.priceUsd);

  // The quoter always prices in the pool's own quote token, so the band check
  // only holds for buys paid in it — and for every sell.
  const inPoolQuote = !buying || token.mint === coin.quote.mint;
  const navCheck =
    nav && quote && inPoolQuote
      ? quoteAgainstNav({ nav, side, amountIn, amountOut: quote.amountOut })
      : null;
  const navUnchecked =
    nav && amountIn > 0
      ? nav.reading.status === "stale"
        ? "Pyth feed is stale"
        : nav.reading.status === "unavailable"
          ? "no Pyth price on this cluster"
          : nav.quoteUsd === null
            ? `no live USD rate for ${coin.quote.symbol}`
            : !inPoolQuote
              ? `quote is not in ${coin.quote.symbol}`
              : null
      : null;

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
                  "text-[28px] leading-none font-semibold",
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
                "w-full min-w-0 bg-transparent text-[28px] leading-none font-semibold tabular-nums outline-none placeholder:text-j-faint",
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

        <div className="mt-1.5 flex items-center justify-between text-[13px] text-j-muted">
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

      <dl className="flex flex-col gap-1.5 text-[13px]">
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
        {quoteError && (
          <div className="flex items-center justify-between">
            <dt className="text-j-muted">Quote</dt>
            <dd className="text-j-danger">{quoteError}</dd>
          </div>
        )}

        {navCheck && navCheck.withinBand && (
          <div className="flex items-center justify-between">
            <dt className="text-j-muted">vs Pyth NAV</dt>
            <dd className="tabular-nums">
              {percent(navCheck.deviation)}{" "}
              <span className="text-j-faint">within ±{nav!.bandBps / 100}%</span>
            </dd>
          </div>
        )}

        {navUnchecked && (
          <div className="flex items-center justify-between">
            <dt className="text-j-muted">NAV band</dt>
            <dd className="text-j-faint">Not checked — {navUnchecked}</dd>
          </div>
        )}
      </dl>

      {navCheck && !navCheck.withinBand && (
        <p
          role="alert"
          className="flex gap-2 rounded-j border border-j-danger/40 bg-j-danger/10 px-3 py-2 text-[13px] leading-snug text-j-danger"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            This {side} fills at {usd(navCheck.executionUsd)} per {coin.symbol},{" "}
            {percent(navCheck.deviation, Math.abs(navCheck.deviation) >= 10 ? 0 : 2)}{" "}
            {navCheck.deviation > 0 ? "above" : "below"} the Pyth NAV of{" "}
            {nav!.reading.status === "live" ? usd(nav!.reading.priceUsd) : "—"} — outside the ±
            {nav!.bandBps / 100}% band.
          </span>
        </p>
      )}

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
        // A failed quote leaves the button enabled so it can retry; it never
        // submits until a quote exists.
        disabled={submitting || amountIn <= 0 || overBalance || (needsQuote && !quoteFailed)}
        onClick={() =>
          needsQuote
            ? setQuoteAttempt((n) => n + 1)
            : onSubmit?.({ side, amountIn, token, comment, quote })
        }
        className="w-full"
      >
        {submitting
          ? "Confirming…"
          : overBalance
            ? buying
              ? "Insufficient balance"
              : `Not enough ${coin.symbol}`
            : needsQuote
              ? quoteFailed
                ? "Couldn’t get a price — tap to retry"
                : "Getting a price…"
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
