import { describe, expect, it } from "vitest";

import {
  PRICE_UPDATE_V2_DISCRIMINATOR,
  PYTH_RECEIVER_PROGRAM,
  decodePriceUpdateV2,
  priceFeedAccount,
  scaled,
} from "@/lib/juno/pyth-account";
import { PYTH_FEEDS, feedIdFor, freshestUpdate, toReading, ttlFor } from "@/lib/juno/pyth";
import { executionPrice, navBand, quoteAgainstNav, type NavContext } from "@/lib/juno/nav";
import { pythAccountUrl, pythSource } from "@/lib/juno/pyth-source";

/*
 * Real account data, read from Solana devnet with `getAccountInfo` on
 * 2026-09-18. Not synthesised — these are the bytes Pyth's Receiver wrote.
 */
const SOL_USD_DEVNET = {
  address: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  slot: 500160940,
  base64:
    "IvEjY51+9M1gMUcENA3t3zcf1CRyFI8kjp0abRpesqw6zYt/1dayQwHvDYtv2izrpB2hXUCV0do5Kg0vjtDGx7wPTPrIwoC1bb22xnACAAAAPnAZAAAAAAD4////db2sagAAAAB0vaxqAAAAAHQYGmsCAAAAXoUbAAAAAAAj2M8dAAAAAAA=",
};
const AAPL_USD_DEVNET = {
  address: "DJ2FyTgUAkEtXW3U5P9PF19meFTRtW4ZWKKFgACfVbUy",
  base64:
    "IvEjY51+9M22qIobWbfIasZFzYU4kLAmRMXwVLcgFl9Eo5UYbkGDfgFJ9rZcsd5rEOr3XnwDygKcMG0DV+kbUxGxdQhKWtVWiIqGzAEAAAAAgDcAAAAAAAD7////R2xGagAAAABGbEZqAAAAANagyQEAAAAA3FAAAAAAAAATqjgcAAAAAAA=",
};

const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

describe("priceFeedAccount", () => {
  it("derives the sponsored shard-0 addresses Pyth actually writes to", () => {
    expect(priceFeedAccount(PYTH_FEEDS["Crypto.SOL/USD"]).toBase58()).toBe(SOL_USD_DEVNET.address);
    expect(priceFeedAccount(PYTH_FEEDS["Crypto.USDC/USD"]).toBase58()).toBe(
      "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
    );
    expect(priceFeedAccount(PYTH_FEEDS["Equity.US.AAPL/USD"]).toBase58()).toBe(AAPL_USD_DEVNET.address);
  });

  it("puts other shards at other addresses", () => {
    expect(priceFeedAccount(PYTH_FEEDS["Crypto.SOL/USD"], 1).toBase58()).toBe(
      "6bWEn5B8eJCRAek5acd3R7d4Sx3e7JWvt84srqqfYgt",
    );
  });

  it("accepts a 0x prefix and rejects anything that is not a feed id", () => {
    expect(priceFeedAccount(`0x${PYTH_FEEDS["Crypto.SOL/USD"]}`).toBase58()).toBe(SOL_USD_DEVNET.address);
    expect(() => priceFeedAccount("abc")).toThrow();
  });
});

describe("decodePriceUpdateV2", () => {
  it("decodes a real devnet SOL/USD account", () => {
    const update = decodePriceUpdateV2(bytes(SOL_USD_DEVNET.base64))!;
    expect(update.feedId).toBe(PYTH_FEEDS["Crypto.SOL/USD"]);
    expect(update.verification).toEqual({ level: "full" });
    expect(update.price).toBe(10482005693n);
    expect(update.conf).toBe(1667134n);
    expect(update.exponent).toBe(-8);
    expect(new Date(update.publishTime * 1000).toISOString()).toBe("2026-09-18T04:26:29.000Z");
    expect(scaled(update.price, update.exponent)).toBeCloseTo(104.82005693, 8);
    // Posted after it was published, and before the slot we read it at.
    expect(update.postedSlot).toBeLessThanOrEqual(BigInt(SOL_USD_DEVNET.slot));
  });

  it("decodes a real devnet equity account with its own exponent", () => {
    const update = decodePriceUpdateV2(bytes(AAPL_USD_DEVNET.base64))!;
    expect(update.feedId).toBe(PYTH_FEEDS["Equity.US.AAPL/USD"]);
    expect(update.exponent).toBe(-5);
    expect(scaled(update.price, update.exponent)).toBeCloseTo(301.81002, 5);
    expect(new Date(update.publishTime * 1000).toISOString()).toBe("2026-07-02T13:48:55.000Z");
  });

  it("shifts every later field by one byte for a Partial verification", () => {
    // Rebuild the SOL account as Partial(5): same fields, one extra byte.
    const full = bytes(SOL_USD_DEVNET.base64);
    const partial = new Uint8Array(full.length + 1);
    partial.set(full.subarray(0, 40), 0);
    partial[40] = 0; // Partial
    partial[41] = 5; // num_signatures
    partial.set(full.subarray(41), 42);

    const update = decodePriceUpdateV2(partial)!;
    expect(update.verification).toEqual({ level: "partial", signatures: 5 });
    expect(update.price).toBe(10482005693n);
    expect(update.exponent).toBe(-8);
    expect(update.feedId).toBe(PYTH_FEEDS["Crypto.SOL/USD"]);
  });

  it("refuses data that is not a PriceUpdateV2", () => {
    const wrong = bytes(SOL_USD_DEVNET.base64);
    wrong[0] ^= 0xff;
    expect(decodePriceUpdateV2(wrong)).toBeNull();
    expect(decodePriceUpdateV2(bytes(SOL_USD_DEVNET.base64).subarray(0, 60))).toBeNull();
    expect(decodePriceUpdateV2(new Uint8Array(0))).toBeNull();

    const badTag = bytes(SOL_USD_DEVNET.base64);
    badTag[40] = 7;
    expect(decodePriceUpdateV2(badTag)).toBeNull();
  });

  it("uses the Anchor discriminator for PriceUpdateV2", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update("account:PriceUpdateV2").digest().subarray(0, 8);
    expect(Array.from(PRICE_UPDATE_V2_DISCRIMINATOR)).toEqual(Array.from(expected));
  });
});

describe("freshestUpdate / toReading", () => {
  const solId = PYTH_FEEDS["Crypto.SOL/USD"];
  const sol = { address: SOL_USD_DEVNET.address, owner: PYTH_RECEIVER_PROGRAM, data: bytes(SOL_USD_DEVNET.base64) };
  const published = Date.parse("2026-09-18T04:26:29Z") / 1000;

  it("is live inside the age bound and carries the decoded numbers", () => {
    const reading = toReading(solId, freshestUpdate(solId, [sol, null]), published + 64, 600);
    expect(reading.status).toBe("live");
    if (reading.status !== "live") return;
    expect(reading.priceUsd).toBeCloseTo(104.82005693, 8);
    expect(reading.confidence).toBeCloseTo(0.01667134, 8);
    expect(reading.account).toBe(SOL_USD_DEVNET.address);
  });

  it("goes stale past the bound and then carries no price at all", () => {
    const reading = toReading(solId, freshestUpdate(solId, [sol]), published + 601, 600);
    expect(reading).toEqual({
      status: "stale",
      feedId: solId,
      publishedAt: "2026-09-18T04:26:29.000Z",
      account: SOL_USD_DEVNET.address,
      source: "solana",
    });
    expect("priceUsd" in reading).toBe(false);
  });

  it("is unavailable when no account exists", () => {
    expect(toReading(solId, freshestUpdate(solId, [null, null]), published).status).toBe("unavailable");
  });

  it("ignores accounts not owned by the Receiver", () => {
    const spoof = { ...sol, owner: "11111111111111111111111111111111" };
    expect(freshestUpdate(solId, [spoof])).toBeNull();
  });

  it("ignores an account for a different feed", () => {
    const aapl = { address: AAPL_USD_DEVNET.address, owner: PYTH_RECEIVER_PROGRAM, data: bytes(AAPL_USD_DEVNET.base64) };
    expect(freshestUpdate(solId, [aapl])).toBeNull();
  });

  it("keeps the newer of two shards", () => {
    const older = bytes(SOL_USD_DEVNET.base64);
    // publish_time sits at 8+32+1+32+8+8+4 = 93.
    new DataView(older.buffer).setBigInt64(93, BigInt(published - 1000), true);
    const found = freshestUpdate(solId, [
      { address: "older", owner: PYTH_RECEIVER_PROGRAM, data: older },
      sol,
    ]);
    expect(found?.address).toBe(SOL_USD_DEVNET.address);
  });
});

describe("pythSource", () => {
  it("reads devnet Pyth through the app's own RPC on devnet", () => {
    expect(pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "devnet" })).toEqual({
      network: "devnet",
      rpc: null,
      maxAgeSeconds: 600,
    });
    // Unset means devnet, matching `cluster()`.
    expect(pythSource({}).network).toBe("devnet");
  });

  it("reads mainnet Pyth through the app's own RPC on mainnet", () => {
    expect(pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta" })).toEqual({
      network: "mainnet-beta",
      rpc: null,
      maxAgeSeconds: 180,
    });
  });

  it("reads live mainnet on a fork, because cloned accounts never update", () => {
    expect(pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-fork" })).toEqual({
      network: "mainnet-beta",
      rpc: "https://api.mainnet-beta.solana.com",
      maxAgeSeconds: 180,
    });
  });

  it("lets PYTH_RPC_URL and PYTH_MAX_AGE_SECONDS override", () => {
    const source = pythSource({
      NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-fork",
      PYTH_RPC_URL: "http://127.0.0.1:8899",
      PYTH_MAX_AGE_SECONDS: "90",
    });
    expect(source).toEqual({ network: "mainnet-beta", rpc: "http://127.0.0.1:8899", maxAgeSeconds: 90 });
  });

  it("links the price account on the network it was read from", () => {
    const address = SOL_USD_DEVNET.address;
    expect(pythAccountUrl(address, pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "devnet" }))).toBe(
      `https://solscan.io/account/${address}?cluster=devnet`,
    );
    expect(pythAccountUrl(address, pythSource({ NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-fork" }))).toBe(
      `https://solscan.io/account/${address}`,
    );
  });
});

describe("ttlFor", () => {
  it("re-reads live prices often, settled feeds rarely, and failed reads soonest", () => {
    const live = ttlFor({
      status: "live", feedId: "x", priceUsd: 1, confidence: 0, publishedAt: "", account: null, source: "solana",
    });
    const stale = ttlFor({ status: "stale", feedId: "x", publishedAt: "", account: null, source: "solana" });
    const missing = ttlFor({ status: "unavailable", feedId: "x", reason: "No Pyth price account for this feed on this cluster" });
    const failed = ttlFor({ status: "unavailable", feedId: "x", reason: "Solana RPC read failed" });
    expect(failed).toBeLessThan(live);
    expect(live).toBeLessThan(stale);
    expect(missing).toBe(stale);
    // Never long enough to hide a feed crossing the staleness bound for real.
    expect(stale).toBeLessThanOrEqual(60_000);
  });
});

describe("feedIdFor", () => {
  it("resolves names, bare ids and 0x ids", () => {
    expect(feedIdFor("Equity.US.TSLA/USD")).toBe(
      "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    );
    expect(feedIdFor(`0x${PYTH_FEEDS["Crypto.SOL/USD"].toUpperCase()}`)).toBe(PYTH_FEEDS["Crypto.SOL/USD"]);
    expect(feedIdFor("Equity.US.NOPE/USD")).toBeNull();
    expect(feedIdFor(null)).toBeNull();
  });

  it("no longer maps MSFT to the BTC/USD feed", () => {
    expect(feedIdFor("Equity.US.MSFT/USD")).not.toBe(
      "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    );
  });
});

describe("navBand", () => {
  it("measures signed deviation and the band edges", () => {
    const band = navBand({ priceUsd: 103, navUsd: 100, bandBps: 200 })!;
    expect(band.deviation).toBeCloseTo(0.03, 10);
    expect(band.withinBand).toBe(false);
    expect(band.lowUsd).toBeCloseTo(98, 10);
    expect(band.highUsd).toBeCloseTo(102, 10);

    expect(navBand({ priceUsd: 99, navUsd: 100, bandBps: 200 })!.withinBand).toBe(true);
    expect(navBand({ priceUsd: 97, navUsd: 100, bandBps: 200 })!.deviation).toBeCloseTo(-0.03, 10);
  });

  it("counts a price exactly on the edge as inside, despite float noise", () => {
    expect(navBand({ priceUsd: 102, navUsd: 100, bandBps: 200 })!.withinBand).toBe(true);
    expect(navBand({ priceUsd: 0.3 * 1.04, navUsd: 0.3, bandBps: 400 })!.withinBand).toBe(true);
  });

  it("returns null rather than a verdict when a price is missing", () => {
    expect(navBand({ priceUsd: 100, navUsd: 0, bandBps: 200 })).toBeNull();
    expect(navBand({ priceUsd: 0, navUsd: 100, bandBps: 200 })).toBeNull();
    expect(navBand({ priceUsd: Number.NaN, navUsd: 100, bandBps: 200 })).toBeNull();
    expect(navBand({ priceUsd: Infinity, navUsd: 100, bandBps: 200 })).toBeNull();
  });
});

describe("executionPrice / quoteAgainstNav", () => {
  it("prices a buy as quote spent per coin and a sell as quote received per coin", () => {
    expect(executionPrice({ side: "buy", amountIn: 20, amountOut: 4 })).toBe(5);
    expect(executionPrice({ side: "sell", amountIn: 4, amountOut: 18 })).toBe(4.5);
    expect(executionPrice({ side: "buy", amountIn: 20, amountOut: 0 })).toBeNull();
  });

  const nav = (over: Partial<NavContext> = {}): NavContext => ({
    feedName: "Equity.US.TSLA/USD",
    bandBps: 200,
    quoteUsd: 1,
    reading: {
      status: "live",
      feedId: "x",
      priceUsd: 400,
      confidence: 0.2,
      publishedAt: "2026-09-18T00:00:00Z",
      account: null,
      source: "solana",
    },
    ...over,
  });

  it("flags a fill outside the band", () => {
    // 1000 USDC for 2.4 coins: 416.67 per coin, 4.2% over a 400 NAV.
    const check = quoteAgainstNav({ nav: nav(), side: "buy", amountIn: 1000, amountOut: 2.4 })!;
    expect(check.executionUsd).toBeCloseTo(416.6667, 3);
    expect(check.withinBand).toBe(false);
    expect(check.deviation).toBeGreaterThan(0.04);
  });

  it("converts through the quote token's USD rate", () => {
    // 2 SOL at $200 for 1 coin is $400 — dead on NAV.
    const check = quoteAgainstNav({ nav: nav({ quoteUsd: 200 }), side: "buy", amountIn: 2, amountOut: 1 })!;
    expect(check.executionUsd).toBeCloseTo(400, 10);
    expect(check.withinBand).toBe(true);
  });

  it("does not check when the feed is stale or the quote rate is unknown", () => {
    const stale = nav({
      reading: { status: "stale", feedId: "x", publishedAt: "2026-07-02T13:48:55Z", account: null, source: "solana" },
    });
    expect(quoteAgainstNav({ nav: stale, side: "buy", amountIn: 1000, amountOut: 2.4 })).toBeNull();
    expect(quoteAgainstNav({ nav: nav({ quoteUsd: null }), side: "buy", amountIn: 2, amountOut: 1 })).toBeNull();
  });
});
