import { describe, it, expect } from "vitest";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";

import {
  decodeSwap,
  volumeWithin,
  totalVolume,
  priceSeries,
  changeWithin,
  DAY_MS,
  type PoolSwap,
  type PoolVaults,
} from "@/lib/juno/swaps";

/**
 * Swap decoding, against transactions built to order.
 *
 * The live counterpart (`tests/integration/juno-swaps.test.ts`) proves the
 * decoder agrees with real history. This one proves the rules, including the
 * cases a real pool only produces once — a migration, a fee claim — and the
 * ones it should never produce at all.
 */

const BASE_VAULT = "HUiQfprD4FUke5z8rn1bj1a83RzXTQZo71RhEahGFuD5";
const QUOTE_VAULT = "2Udi1FraE9MyAFyNLSWfacRqycBPEVewJUnpxq6ztqS9";
const TRADER = "35epkE8CQYszpQw68ifmFbY6H1NXFd1DCUz2pkqLux55";
const SIGNATURE =
  "J8bCyCkcXzgQcToGZjaqVxoiPgUhYZjPUtAdDYsmiHi5TSiSjJEbmMVSz9JrBCbLS8rUJQ7dAuQ55cAQ9KUD3G7";

const VAULTS: PoolVaults = {
  baseVault: BASE_VAULT,
  quoteVault: QUOTE_VAULT,
  baseDecimals: 6,
  quoteDecimals: 9,
};

type Leg = { vault: string; pre: string | null; post: string | null };

/**
 * A transaction carrying exactly the fields the decoder reads.
 *
 * Account order is deliberate: the trader sits at index 0 because that is where
 * the fee payer always is, and the decoder is supposed to read the trader from
 * there rather than from whichever token account happened to move.
 */
function tx(
  legs: Leg[],
  options: { err?: unknown; blockTime?: number; slot?: number; extraKeys?: string[] } = {},
): ParsedTransactionWithMeta {
  const keys = [TRADER, ...legs.map((leg) => leg.vault), ...(options.extraKeys ?? [])];
  const indexOf = (vault: string) => keys.indexOf(vault);

  const balances = (side: "pre" | "post") =>
    legs
      .filter((leg) => leg[side] !== null)
      .map((leg) => ({
        accountIndex: indexOf(leg.vault),
        mint: leg.vault === BASE_VAULT ? "6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69" : "So11111111111111111111111111111111111111112",
        owner: "ArfH8ApLQM62HmSExU4N5yDT2zPp1SaqQirdCGXWWUJu",
        programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        uiTokenAmount: {
          amount: leg[side] as string,
          decimals: leg.vault === BASE_VAULT ? 6 : 9,
          uiAmount: null,
          uiAmountString: leg[side] as string,
        },
      }));

  return {
    slot: options.slot ?? 500_195_927,
    blockTime: options.blockTime ?? 1_789_711_455,
    transaction: {
      signatures: [SIGNATURE],
      message: {
        accountKeys: keys.map((pubkey, i) => ({
          pubkey: { toString: () => pubkey } as never,
          signer: i === 0,
          writable: true,
          source: "transaction" as const,
        })),
        instructions: [],
        recentBlockhash: "11111111111111111111111111111111",
      },
    },
    meta: {
      err: options.err ?? null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: balances("pre"),
      postTokenBalances: balances("post"),
      logMessages: [],
      innerInstructions: [],
    },
  } as unknown as ParsedTransactionWithMeta;
}

/** The pool sold base and took quote in: a buy. */
const BUY = tx([
  { vault: BASE_VAULT, pre: "999652868344231", post: "999647899750852" },
  { vault: QUOTE_VAULT, pre: "710015228", post: "720015228" },
]);

/** The pool took base in and paid quote out: a sell. */
const SELL = tx([
  { vault: BASE_VAULT, pre: "999642868344231", post: "999652868344231" },
  { vault: QUOTE_VAULT, pre: "729900584", post: "710015228" },
]);

describe("decodeSwap: direction and size from vault deltas", () => {
  it("reads a buy", () => {
    const swap = decodeSwap(BUY, VAULTS);
    expect(swap).not.toBeNull();
    expect(swap!.side).toBe("buy");
    // 999652868344231 - 999647899750852 = 4968593379 raw, 6dp.
    expect(swap!.baseAmount).toBeCloseTo(4968.593379, 9);
    expect(swap!.quoteAmount).toBeCloseTo(0.01, 12);
    expect(swap!.price).toBeCloseTo(0.01 / 4968.593379, 15);
  });

  it("reads a sell — the case a hardcoded side gets wrong", () => {
    const swap = decodeSwap(SELL, VAULTS);
    expect(swap).not.toBeNull();
    expect(swap!.side).toBe("sell");
    expect(swap!.baseAmount).toBeCloseTo(10000, 6);
    expect(swap!.quoteAmount).toBeCloseTo(0.019885356, 12);
  });

  it("takes the trader from the fee payer, not from a token account owner", () => {
    // The token accounts here are owned by the pool authority, which is not a
    // person. Attributing a trade to it would name the wrong party on a
    // public activity feed.
    expect(decodeSwap(BUY, VAULTS)!.trader).toBe(TRADER);
  });

  it("carries the signature, timestamp and slot through unchanged", () => {
    const swap = decodeSwap(BUY, VAULTS)!;
    expect(swap.signature).toBe(SIGNATURE);
    expect(swap.timestamp).toBe(new Date(1_789_711_455 * 1000).toISOString());
    expect(swap.slot).toBe(500_195_927);
  });

  it("keeps full precision on a large raw balance", () => {
    // Vault balances run to 10^15 raw units. Losing precision here would
    // misreport the size of every trade against a big pool.
    const swap = decodeSwap(
      tx([
        { vault: BASE_VAULT, pre: "999999999999999", post: "999999998999999" },
        { vault: QUOTE_VAULT, pre: "0", post: "1000000" },
      ]),
      VAULTS,
    )!;
    expect(swap.baseAmount).toBeCloseTo(1, 9);
    expect(swap.quoteAmount).toBeCloseTo(0.001, 12);
  });
});

describe("decodeSwap: what is not a trade", () => {
  it("rejects a failed transaction", () => {
    expect(decodeSwap(tx([
      { vault: BASE_VAULT, pre: "100", post: "50" },
      { vault: QUOTE_VAULT, pre: "0", post: "50" },
    ], { err: { InstructionError: [0, "Custom"] } }), VAULTS)).toBeNull();
  });

  it("rejects pool creation — base in, no quote leg", () => {
    expect(
      decodeSwap(tx([{ vault: BASE_VAULT, pre: null, post: "1000000000000000" }]), VAULTS),
    ).toBeNull();
  });

  it("rejects a creator fee claim — quote out, no base leg", () => {
    expect(
      decodeSwap(tx([{ vault: QUOTE_VAULT, pre: "9653000", post: "0" }]), VAULTS),
    ).toBeNull();
  });

  it("rejects migration — both vaults drained the same way", () => {
    expect(
      decodeSwap(
        tx([
          { vault: BASE_VAULT, pre: "500000000000", post: "0" },
          { vault: QUOTE_VAULT, pre: "4125000000", post: "0" },
        ]),
        VAULTS,
      ),
    ).toBeNull();
  });

  it("rejects a transaction that moves neither vault", () => {
    expect(
      decodeSwap(tx([], { extraKeys: ["SomeOtherAccount1111111111111111111111111111"] }), VAULTS),
    ).toBeNull();
  });

  it("rejects a zero-value leg rather than dividing by it", () => {
    expect(
      decodeSwap(
        tx([
          { vault: BASE_VAULT, pre: "1000", post: "1000" },
          { vault: QUOTE_VAULT, pre: "0", post: "500" },
        ]),
        VAULTS,
      ),
    ).toBeNull();
  });

  it("ignores another pool's vaults", () => {
    const other: PoolVaults = { ...VAULTS, baseVault: "NotThisPoolsBaseVault11111111111111111111111" };
    expect(decodeSwap(BUY, other)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Derived series                                                      */
/* ------------------------------------------------------------------ */

const NOW = Date.parse("2026-09-21T12:00:00.000Z");

function swap(hoursAgo: number, side: "buy" | "sell", base: number, quote: number, slot: number): PoolSwap {
  return {
    signature: `sig${slot}`,
    side,
    baseAmount: base,
    quoteAmount: quote,
    price: quote / base,
    trader: TRADER,
    timestamp: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    slot,
  };
}

describe("volume", () => {
  const swaps = [
    swap(1, "buy", 100, 1, 300),
    swap(5, "sell", 200, 2, 200),
    swap(30, "buy", 400, 4, 100), // outside a 24h window
  ];

  it("sums only the quote legs inside the window", () => {
    expect(volumeWithin(swaps, DAY_MS, NOW)).toBeCloseTo(3, 12);
  });

  it("sums everything for all-time", () => {
    expect(totalVolume(swaps)).toBeCloseTo(7, 12);
  });

  it("reports null, not zero, when there is no history to measure", () => {
    // A pool nobody has traded and a read that came back empty are different
    // claims. Zero volume asserts the first.
    expect(volumeWithin([], DAY_MS, NOW)).toBeNull();
    expect(totalVolume([])).toBeNull();
  });

  it("reports zero for a real but quiet window", () => {
    // History exists, none of it is recent. Zero is the honest answer here.
    expect(volumeWithin([swap(30, "buy", 400, 4, 100)], DAY_MS, NOW)).toBe(0);
  });
});

describe("priceSeries", () => {
  it("orders oldest first, the way a chart plots", () => {
    const series = priceSeries([
      swap(1, "buy", 100, 1, 300),
      swap(30, "buy", 400, 4, 100),
      swap(5, "sell", 200, 2, 200),
    ]);
    expect(series.map((p) => p.price)).toEqual([0.01, 0.01, 0.01]);
    expect(series.map((p) => Date.parse(p.t))).toEqual([
      NOW - 30 * 3_600_000,
      NOW - 5 * 3_600_000,
      NOW - 1 * 3_600_000,
    ]);
  });

  it("is empty for no swaps rather than inventing a flat line", () => {
    expect(priceSeries([])).toEqual([]);
  });
});

describe("changeWithin", () => {
  it("measures against the last trade before the window opened", () => {
    const swaps = [
      swap(30, "buy", 100, 1, 100), // reference: price 0.01
      swap(2, "buy", 100, 2, 200),
    ];
    // Current price 0.02 against a 0.01 reference is +100%.
    expect(changeWithin(swaps, DAY_MS, 0.02, NOW)).toBeCloseTo(1, 12);
  });

  it("goes negative when the price fell", () => {
    const swaps = [swap(30, "buy", 100, 2, 100)];
    expect(changeWithin(swaps, DAY_MS, 0.01, NOW)).toBeCloseTo(-0.5, 12);
  });

  it("reports null when nothing predates the window", () => {
    // Every trade is inside the window, so there is no "before" to compare to.
    // A zero here would be a claim about a period with no data in it.
    const swaps = [swap(1, "buy", 100, 1, 100), swap(2, "buy", 100, 1, 90)];
    expect(changeWithin(swaps, DAY_MS, 0.01, NOW)).toBeNull();
  });

  it("reports null for no history and for a nonsense current price", () => {
    expect(changeWithin([], DAY_MS, 0.01, NOW)).toBeNull();
    expect(changeWithin([swap(30, "buy", 100, 1, 100)], DAY_MS, 0, NOW)).toBeNull();
  });

  it("reports zero when a real reference exists and the price is unchanged", () => {
    const swaps = [swap(30, "buy", 100, 1, 100)];
    expect(changeWithin(swaps, DAY_MS, 0.01, NOW)).toBe(0);
  });

  it("measures a coin younger than the window from its opening price", () => {
    const young = { price: 0.01, at: NOW - 60 * 60 * 1000 };
    expect(changeWithin([], DAY_MS, 0.012, NOW, young)).toBeCloseTo(0.2, 12);
    // An opening older than the window is not a reference for it.
    const old = { price: 0.01, at: NOW - 2 * DAY_MS };
    expect(changeWithin([], DAY_MS, 0.012, NOW, old)).toBeNull();
  });
});
