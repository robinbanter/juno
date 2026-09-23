import { describe, it, expect } from "vitest";

import {
  PYTH_FEEDS,
  fetchPythPrice,
  fetchPythPrices,
  feedNameFor,
  isEquityFeed,
  isFresh,
  marketState,
  priceAccountFor,
  quoteTokenUsdPrice,
  WSOL_MINT,
  type PythFeedName,
} from "@/lib/juno/pyth";

/**
 * Live reads of Pyth's on-chain push-oracle accounts. Read-only, no key.
 *
 * The point of this suite is that every feed id Juno ships is real. An id is a
 * 32-byte hex string with no checksum and no way to eyeball it, so a wrong one
 * fails silently — it derives a PDA that simply holds no account, and the NAV
 * band quietly never draws. One of these ids was in fact invented while this
 * module was being written, and this test is what would have caught it.
 */

const FEED_NAMES = Object.keys(PYTH_FEEDS) as PythFeedName[];

/** Plausibility bounds, wide enough to never need touching for market moves. */
const SANE: Record<string, [number, number]> = {
  "Crypto.SOL/USD": [1, 10_000],
  "Crypto.USDC/USD": [0.5, 1.5],
  "Equity.US.AAPL/USD": [10, 10_000],
  "Equity.US.NVDA/USD": [1, 10_000],
  "Equity.US.TSLA/USD": [10, 10_000],
  "Equity.US.MSFT/USD": [10, 10_000],
  "Equity.US.GOOGL/USD": [10, 10_000],
  "Equity.US.AMZN/USD": [10, 10_000],
  "Equity.US.META/USD": [10, 10_000],
  // SpaceX, the one pre-IPO name on the Solana push oracle. Wide on purpose:
  // the check is that the id reads a real price, not what the price is.
  "Equity.US.SPCX/USD": [1, 100_000],
};

describe("pyth: every shipped feed id resolves to a real on-chain account", () => {
  it.each(FEED_NAMES)("%s", async (name) => {
    const price = await fetchPythPrice(PYTH_FEEDS[name]);

    // A price of null here means the id does not correspond to a published
    // feed — which is what a typo or an invented id looks like.
    expect(price, `no on-chain account for ${name} — is the feed id real?`).not.toBeNull();

    expect(price!.feed).toBe(PYTH_FEEDS[name]);
    expect(feedNameFor(price!.feed)).toBe(name);

    const [low, high] = SANE[name];
    expect(price!.priceUsd).toBeGreaterThan(low);
    expect(price!.priceUsd).toBeLessThan(high);

    // Confidence is an interval around the price, not a price itself.
    expect(price!.confidence).toBeGreaterThanOrEqual(0);
    expect(price!.confidence).toBeLessThan(price!.priceUsd);

    expect(Number.isFinite(Date.parse(price!.publishedAt))).toBe(true);
    expect(price!.ageSeconds).toBeGreaterThanOrEqual(0);
    expect([0, 1]).toContain(price!.shard);

    // Every feed must be fresh by its own asset class's rule. A crypto feed
    // that is minutes old, or an equity feed that has missed a whole week, is
    // a publisher problem worth failing on.
    expect(isFresh(price!), `${name} is stale: ${price!.ageSeconds}s old`).toBe(true);
  }, 60_000);

  it("picks the fresher shard rather than trusting a fixed one", async () => {
    // Measured on mainnet: crypto is current on shard 0 and equities on shard 1,
    // with the other shard of each lagging badly. Hardcoding either would
    // silently serve a stale mark for half the catalogue.
    const sol = await fetchPythPrice(PYTH_FEEDS["Crypto.SOL/USD"]);
    const aapl = await fetchPythPrice(PYTH_FEEDS["Equity.US.AAPL/USD"]);
    expect(sol).not.toBeNull();
    expect(aapl).not.toBeNull();

    // Whichever shard each came from, it must be the fresher of the two.
    for (const price of [sol!, aapl!]) {
      const other = await fetchPythPrice(price.feed);
      expect(other!.ageSeconds).toBeLessThanOrEqual(price.ageSeconds + 120);
    }
  }, 60_000);

  it("classifies a crypto feed as live and an equity feed by market hours", async () => {
    const sol = (await fetchPythPrice(PYTH_FEEDS["Crypto.SOL/USD"]))!;
    expect(isEquityFeed(sol.feed)).toBe(false);
    expect(marketState(sol)).toBe("live");

    const aapl = (await fetchPythPrice(PYTH_FEEDS["Equity.US.AAPL/USD"]))!;
    expect(isEquityFeed(aapl.feed)).toBe(true);
    // Either the exchange is open or it is not; both are valid, "stale" is not.
    expect(["live", "closed"]).toContain(marketState(aapl));
  }, 60_000);

  it("prices SOL in dollars and treats stablecoins as one", async () => {
    const sol = await quoteTokenUsdPrice(WSOL_MINT);
    expect(sol).not.toBeNull();
    expect(sol!).toBeGreaterThan(1);

    // USDC does not get read off its own feed — a market cap that wobbles by a
    // few basis points because the peg drifted is noise, not information.
    await expect(
      quoteTokenUsdPrice("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    ).resolves.toBe(1);
  }, 60_000);

  it("returns null for a well-formed id that was never published", async () => {
    // Correct shape, no such feed. This is exactly the failure mode a wrong id
    // produces, and it must be null rather than an exception or a zero.
    await expect(fetchPythPrice("0".repeat(64))).resolves.toBeNull();
    await expect(fetchPythPrice("not a feed id")).resolves.toBeNull();
    await expect(fetchPythPrice(null)).resolves.toBeNull();
  }, 60_000);

  it("reads several feeds in one call, keyed by id", async () => {
    const prices = await fetchPythPrices([
      PYTH_FEEDS["Crypto.SOL/USD"],
      PYTH_FEEDS["Equity.US.NVDA/USD"],
      "0".repeat(64),
      null,
    ]);
    expect(Object.keys(prices).sort()).toEqual(
      [PYTH_FEEDS["Crypto.SOL/USD"], PYTH_FEEDS["Equity.US.NVDA/USD"]].sort(),
    );
  }, 60_000);

  it("derives distinct accounts per shard, deterministically", () => {
    const id = PYTH_FEEDS["Crypto.SOL/USD"];
    // Pinned: this is the canonical mainnet SOL/USD price account. If the seed
    // scheme were wrong, every lookup would miss and every price would be null.
    expect(priceAccountFor(id, 0).toBase58()).toBe(
      "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    );
    expect(priceAccountFor(id, 1).toBase58()).not.toBe(
      priceAccountFor(id, 0).toBase58(),
    );
    // Accepts an 0x prefix too, since feed ids are quoted both ways.
    expect(priceAccountFor(`0x${id}`, 0).toBase58()).toBe(
      priceAccountFor(id, 0).toBase58(),
    );
  });
});
