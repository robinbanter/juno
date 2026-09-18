/**
 * NAV band maths — where a pool's price sits against its Pyth reference.
 *
 * Pure and client-safe: the coin page computes the band server-side and the
 * trade panel re-runs it on every quote in the browser.
 */

/**
 * The price, as the UI is allowed to see it. A stale or missing feed carries
 * no number at all, so no component can accidentally render one.
 */
export type NavReading =
  | {
      status: "live";
      feedId: string;
      priceUsd: number;
      /** Pyth's own confidence interval, in dollars. */
      confidence: number;
      publishedAt: string;
      /** The on-chain account it came from, for the explorer link. */
      account: string | null;
      source: "solana" | "hermes";
    }
  | {
      status: "stale";
      feedId: string;
      /** When the newest price we could find was published. */
      publishedAt: string;
      account: string | null;
      source: "solana" | "hermes";
    }
  | {
      status: "unavailable";
      feedId: string;
      reason: string;
    };

export type NavContext = {
  /** e.g. `Equity.US.TSLA/USD`. */
  feedName: string;
  bandBps: number;
  reading: NavReading;
  /** USD per unit of the pool's quote token; null when that is unknown too. */
  quoteUsd: number | null;
};

export type BandPosition = {
  /** Signed: +0.03 means the pool trades 3% above NAV. */
  deviation: number;
  withinBand: boolean;
  lowUsd: number;
  highUsd: number;
};

/**
 * Where `priceUsd` lands against `navUsd ± bandBps`. Null when either price
 * is not a positive finite number — there is no band to be inside of, and
 * "within band" would be a claim we had not earned.
 */
export function navBand(params: {
  priceUsd: number;
  navUsd: number;
  bandBps: number;
}): BandPosition | null {
  const { priceUsd, navUsd, bandBps } = params;
  if (!(navUsd > 0) || !(priceUsd > 0) || !Number.isFinite(priceUsd)) return null;
  if (!(bandBps >= 0)) return null;
  const width = bandBps / 10_000;
  const deviation = (priceUsd - navUsd) / navUsd;
  return {
    deviation,
    // Compared in bps, rounded, so a price sitting exactly on the edge is
    // not pushed out by float noise.
    withinBand: Math.round(Math.abs(deviation) * 1e8) <= Math.round(width * 1e8),
    lowUsd: navUsd * (1 - width),
    highUsd: navUsd * (1 + width),
  };
}

/**
 * The average price a quoted trade fills at, in quote-token units per coin.
 *
 * A buy spends `amountIn` quote for `amountOut` coins; a sell spends
 * `amountIn` coins for `amountOut` quote. Fees are inside both numbers, which
 * is what a trader actually pays.
 */
export function executionPrice(params: {
  side: "buy" | "sell";
  amountIn: number;
  amountOut: number;
}): number | null {
  const { side, amountIn, amountOut } = params;
  if (!(amountIn > 0) || !(amountOut > 0)) return null;
  return side === "buy" ? amountIn / amountOut : amountOut / amountIn;
}

/**
 * The band check the trade panel runs on a quote. Null whenever any input is
 * not live — the panel then says the band could not be checked, rather than
 * staying silent as though the trade were fine.
 */
export function quoteAgainstNav(params: {
  nav: NavContext;
  side: "buy" | "sell";
  amountIn: number;
  amountOut: number;
}): (BandPosition & { executionUsd: number }) | null {
  const { nav, side, amountIn, amountOut } = params;
  if (nav.reading.status !== "live" || nav.quoteUsd === null) return null;
  const inQuote = executionPrice({ side, amountIn, amountOut });
  if (inQuote === null) return null;
  const executionUsd = inQuote * nav.quoteUsd;
  const band = navBand({ priceUsd: executionUsd, navUsd: nav.reading.priceUsd, bandBps: nav.bandBps });
  return band ? { ...band, executionUsd } : null;
}
