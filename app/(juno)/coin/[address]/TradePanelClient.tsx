"use client";

import { useCallback } from "react";

import type { Coin, QuoteToken, TradeSide } from "@/lib/juno/types";
import { TradePanel, type TradeQuoteResult } from "@/components/juno/coin/TradePanel";

/**
 * Wires the trade panel to a pricing source.
 *
 * Today it prices off the coin's spot price so the panel is exercisable
 * without a live pool. Point `onQuote` at `quoteTrade({ snapshot, ... })` from
 * `lib/juno/dbc.ts` and the same component prices against the real curve —
 * the argument and return shapes already match.
 */
export function TradePanelClient({
  coin,
  quoteTokens,
  className,
}: {
  coin: Coin;
  quoteTokens: QuoteToken[];
  className?: string;
}) {
  const onQuote = useCallback(
    async ({
      side,
      amountIn,
    }: {
      side: TradeSide;
      amountIn: number;
    }): Promise<TradeQuoteResult | null> => {
      if (coin.priceUsd <= 0) return null;
      // Buy: quote in, coins out. Sell: coins in, quote out.
      const amountOut =
        side === "buy" ? amountIn / coin.priceUsd : amountIn * coin.priceUsd;
      return {
        amountOut,
        minimumAmountOut: amountOut * 0.99,
        fee: (side === "buy" ? amountIn : amountOut) * 0.01,
        priceImpact: 0,
      };
    },
    [coin.priceUsd],
  );

  return (
    <TradePanel
      coin={coin}
      quoteTokens={quoteTokens}
      balanceUsd={0}
      holding={0}
      networkFeeUsd={0.0002}
      quotePricesUsd={{ [coin.quote.mint]: 1 }}
      onQuote={onQuote}
      onSubmit={() => {
        // Connect a wallet adapter, then `buildSwapTransaction` +
        // `sendTransaction`. Deliberately inert until a wallet is wired.
      }}
      className={className}
    />
  );
}
