"use client";

import { useCallback } from "react";
import { ExternalLink } from "lucide-react";

import { explorer } from "@/lib/juno/cluster";
import { quoteTrade } from "@/lib/juno/dbc";
import type { NavContext } from "@/lib/juno/nav";
import type { Coin, QuoteToken, TradeSide } from "@/lib/juno/types";
import { TradePanel, type TradeQuoteResult } from "@/components/juno/coin/TradePanel";
import { useTrade } from "@/components/juno/wallet/useTrade";

/**
 * The coin page's trade surface, wired to the live pool.
 *
 * Quotes price against real account state through the DBC quoter, and a
 * confirmed trade returns a signature that links straight to the explorer.
 */
export function TradePanelClient({
  coin,
  quoteTokens,
  quoteUsd,
  nav,
  className,
}: {
  coin: Coin;
  quoteTokens: QuoteToken[];
  /** USD per unit of the pool's quote token, from Pyth; null when not live. */
  quoteUsd: number | null;
  /** Present for pools launched against a Pyth feed with a band. */
  nav: NavContext | null;
  className?: string;
}) {
  const { ensureSnapshot, balanceUsd, holding, state, swap, reset, connected } = useTrade(coin);

  const onQuote = useCallback(
    async ({
      side,
      amountIn,
    }: {
      side: TradeSide;
      amountIn: number;
    }): Promise<TradeQuoteResult | null> => {
      if (amountIn <= 0) return null;
      const snapshot = await ensureSnapshot();
      if (!snapshot) return null;
      // Real curve math against the pool as it stands right now.
      return quoteTrade({ snapshot, side, amountIn, slippageBps: 100 });
    },
    [ensureSnapshot],
  );

  const busy = state.status === "signing" || state.status === "confirming";

  return (
    <div className={className}>
      <TradePanel
        coin={coin}
        quoteTokens={quoteTokens}
        connected={connected}
        balanceUsd={balanceUsd}
        holding={holding}
        // Only a live rate is passed. Without one a SOL amount has no dollar
        // echo, rather than being shown as though one SOL were one dollar.
        quotePricesUsd={quoteUsd === null ? {} : { [coin.quote.mint]: quoteUsd }}
        nav={nav}
        onQuote={onQuote}
        submitting={busy}
        onSubmit={({ side, amountIn, quote }) => {
          // Never send without a quote. The previous fallback was
          // `minimumAmountOut: 0`, commented as "the program itself rejects
          // rather than filling at any price". It does not: simulating a buy
          // against the DBC program with minimumAmountOut = 0 returns
          // err: null, while an unreachable minimum returns ExceededSlippage.
          // A zero minimum is no slippage protection at all. TradePanel
          // already refuses to submit without a quote; this is the backstop.
          if (!quote) return;
          void swap({ side, amountIn, minimumAmountOut: quote.minimumAmountOut });
        }}
      />

      {state.status === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-j border border-j-danger/40 bg-j-danger/10 px-3 py-2 text-[13px] text-j-danger"
        >
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-j border border-j-pos/40 bg-j-pos/10 px-3 py-2 text-[13px]">
          <span className="font-semibold text-j-pos">Trade confirmed</span>
          <span className="flex items-center gap-3">
            <a
              href={explorer.tx(state.signature)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-j-muted hover:text-j-ink"
            >
              View tx
              <ExternalLink size={11} />
            </a>
            <button type="button" onClick={reset} className="text-j-muted hover:text-j-ink">
              Dismiss
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
