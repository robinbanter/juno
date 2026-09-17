/**
 * Pyth price feeds.
 *
 * Two jobs. First, quoting a SOL-denominated pool in dollars honestly — market
 * caps in SOL terms are not comparable across pools. Second, the NAV band:
 * an equity-preset launch is supposed to track an underlying, and a bonding
 * curve has no idea what the underlying costs. Pyth is what closes that loop,
 * which is why `navBandBps` exists on the equity presets.
 *
 * Read through Hermes over HTTP — no on-chain account, no keys.
 */

const HERMES = "https://hermes.pyth.network";

/** Feed ids are stable. Verified against Hermes `/v2/price_feeds`. */
export const PYTH_FEEDS = {
  "Crypto.SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Equity.US.NVDA/USD": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  "Equity.US.TSLA/USD": "16b47ff0d046f56191f636a4454790088924b13c714e082c90e1fc84cf734994",
  "Equity.US.MSFT/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "Equity.US.AMZN/USD": "5ca6524316a5047b7117e7d6cf6ecc5e6488730eb6022e37e96b3a0e44b80b2a",
} as const;

export type PythFeedName = keyof typeof PYTH_FEEDS;

export type PythPrice = {
  feed: string;
  priceUsd: number;
  /** Pyth's own confidence interval, in dollars. */
  confidence: number;
  publishedAt: string;
};

export function feedIdFor(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name in PYTH_FEEDS) return PYTH_FEEDS[name as PythFeedName];
  // Already an id.
  return /^[0-9a-f]{64}$/i.test(name) ? name.toLowerCase() : null;
}

/**
 * Fetch one or more prices. Returns a map keyed by feed id; a feed Hermes does
 * not answer for is simply absent rather than defaulted to a number.
 */
export async function fetchPythPrices(
  feedIds: string[],
): Promise<Record<string, PythPrice>> {
  // Hermes moved its price endpoints behind an API key. Without one there is
  // no price to report, and reporting one anyway would be worse than none.
  if (!process.env.PYTH_API_KEY) return {};
  const ids = [...new Set(feedIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const params = ids.map((id) => `ids[]=${id}`).join("&");
  const response = await fetch(`${HERMES}/v2/updates/price/latest?${params}&parsed=true`, {
    headers: { Authorization: `Bearer ${process.env.PYTH_API_KEY}` },
    // Equity marks move on a timescale where a few seconds of cache is free.
    next: { revalidate: 10 },
  });
  if (!response.ok) return {};

  const body = (await response.json()) as {
    parsed?: Array<{
      id: string;
      price: { price: string; conf: string; expo: number; publish_time: number };
    }>;
  };

  const out: Record<string, PythPrice> = {};
  for (const entry of body.parsed ?? []) {
    const scale = 10 ** entry.price.expo;
    out[entry.id] = {
      feed: entry.id,
      priceUsd: Number(entry.price.price) * scale,
      confidence: Number(entry.price.conf) * scale,
      publishedAt: new Date(entry.price.publish_time * 1000).toISOString(),
    };
  }
  return out;
}

export async function fetchPythPrice(feedId: string): Promise<PythPrice | null> {
  const prices = await fetchPythPrices([feedId]);
  return prices[feedId] ?? null;
}

/**
 * USD value of one unit of a pool's quote token, or null when unknowable.
 *
 * Stablecoins are 1 by definition. SOL needs a feed, and null is the honest
 * answer when Hermes will not serve one — a pool denominated in SOL is better
 * shown in SOL than at an invented dollar rate.
 */
export async function quoteTokenUsdPrice(quoteMint: string): Promise<number | null> {
  if (quoteMint !== WSOL_MINT) return 1; // USDC and other stables
  const sol = await fetchPythPrice(PYTH_FEEDS["Crypto.SOL/USD"]).catch(() => null);
  return sol?.priceUsd ?? null;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Where the curve sits against the underlying.
 *
 * `deviation` is signed: positive means the curve is trading above the
 * reference mark. `withinBand` compares it to the preset's own tolerance.
 */
export function navBand(params: {
  curvePriceUsd: number;
  navPriceUsd: number;
  bandBps: number;
}): { deviation: number; withinBand: boolean } {
  const { curvePriceUsd, navPriceUsd, bandBps } = params;
  if (navPriceUsd <= 0) return { deviation: 0, withinBand: true };
  const deviation = (curvePriceUsd - navPriceUsd) / navPriceUsd;
  return { deviation, withinBand: Math.abs(deviation) * 10_000 <= bandBps };
}
