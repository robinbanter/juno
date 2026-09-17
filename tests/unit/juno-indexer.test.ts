import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";

import {
  change24hPct,
  parseSwap,
  pricePoints,
  totalVolume,
  volume24h,
  type SwapHistory,
} from "@/lib/juno/indexer";

/**
 * The parser turns consensus token-balance deltas into trades, so the fixtures
 * below are the balance shapes real devnet transactions actually produced —
 * taken from `getParsedTransaction` output for pool
 * `FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK`, not invented.
 *
 * The aggregate tests matter at least as much as the parse tests: every one of
 * them is really asking "does this refuse to state a number it cannot back",
 * which is the property the UI depends on.
 */

const BASE = "6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69";
const WSOL = "So11111111111111111111111111111111111111112";
const VAULT_AUTHORITY = "FhVo3mqL8PsKqEfRLg1TBVsDbNkfDRJWsmLuLJ6yCTxa";
const TRADER = "9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE";

type Balance = {
  accountIndex: number;
  mint: string;
  owner: string;
  amount: number;
};

function balance({ accountIndex, mint, owner, amount }: Balance) {
  return {
    accountIndex,
    mint,
    owner,
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    uiTokenAmount: {
      amount: String(Math.round(amount * 1e6)),
      decimals: 6,
      uiAmount: amount,
      uiAmountString: String(amount),
    },
  };
}

function tx({
  pre,
  post,
  blockTime = 1_758_000_000,
  err = null,
  signature = "sig-1",
}: {
  pre: Balance[];
  post: Balance[];
  blockTime?: number | null;
  err?: unknown;
  signature?: string;
}): ParsedTransactionWithMeta {
  return {
    slot: 1,
    blockTime,
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [
          { pubkey: new PublicKey(TRADER), signer: true, writable: true },
        ],
        instructions: [],
        recentBlockhash: "",
      },
    },
    meta: {
      err,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: pre.map(balance),
      postTokenBalances: post.map(balance),
      logMessages: [],
      innerInstructions: [],
    },
  } as unknown as ParsedTransactionWithMeta;
}

/** The real 0.5 SOL buy: quote into the vault, base out of it. */
const BUY = tx({
  signature: "59DBxUgPPjANJhKEmuxp5FMXL4sSR77Uxs8kefRhMuKQkptnVMgSbPvN",
  pre: [
    { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0 },
    { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 1_000_000_000 },
  ],
  post: [
    { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0.5 },
    { accountIndex: 2, mint: BASE, owner: TRADER, amount: 250_000 },
    { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 999_750_000 },
  ],
});

/** The real 5,000-token sell: base into the vault, quote out of it. */
const SELL = tx({
  signature: "xWxpJFtZB8ZzpHLVPZshHgYvuEHSJ9vKertf9yrovrfu1rup1oGLzaVs",
  blockTime: 1_758_086_400,
  pre: [
    { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0.5 },
    { accountIndex: 2, mint: BASE, owner: TRADER, amount: 250_000 },
    { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 999_750_000 },
  ],
  post: [
    { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0.49 },
    { accountIndex: 2, mint: BASE, owner: TRADER, amount: 245_000 },
    { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 999_755_000 },
  ],
});

function history(swaps: SwapHistory["swaps"], extra: Partial<SwapHistory> = {}): SwapHistory {
  return { swaps, truncated: false, missed: 0, oldestBlockTime: 1, ...extra };
}

describe("parseSwap", () => {
  it("reads a buy: quote into the vault, base out", () => {
    const swap = parseSwap(BUY, BASE);
    expect(swap).not.toBeNull();
    expect(swap!.side).toBe("buy");
    expect(swap!.quoteAmount).toBeCloseTo(0.5, 9);
    expect(swap!.baseAmount).toBeCloseTo(250_000, 6);
    expect(swap!.price).toBeCloseTo(0.5 / 250_000, 12);
    expect(swap!.trader).toBe(TRADER);
  });

  it("reads a sell: base into the vault, quote out", () => {
    const swap = parseSwap(SELL, BASE);
    expect(swap).not.toBeNull();
    expect(swap!.side).toBe("sell");
    expect(swap!.quoteAmount).toBeCloseTo(0.01, 9);
    expect(swap!.baseAmount).toBeCloseTo(5_000, 6);
  });

  it("rejects a pool creation — base moves, no quote leg", () => {
    const creation = tx({
      pre: [],
      post: [
        { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 1_000_000_000 },
        { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0 },
      ],
    });
    expect(parseSwap(creation, BASE)).toBeNull();
  });

  it("rejects a fee claim — quote moves, no base leg", () => {
    const claim = tx({
      pre: [{ accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0.5 }],
      post: [{ accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 0.4 }],
    });
    expect(parseSwap(claim, BASE)).toBeNull();
  });

  it("rejects a failed transaction", () => {
    const failed = tx({ pre: [], post: [], err: { InstructionError: [0, "Custom"] } });
    expect(parseSwap(failed, BASE)).toBeNull();
  });

  it("rejects a transfer where both legs move the same way", () => {
    const bogus = tx({
      pre: [
        { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 1 },
        { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 100 },
      ],
      post: [
        { accountIndex: 1, mint: WSOL, owner: VAULT_AUTHORITY, amount: 2 },
        { accountIndex: 5, mint: BASE, owner: VAULT_AUTHORITY, amount: 200 },
      ],
    });
    expect(parseSwap(bogus, BASE)).toBeNull();
  });

  it("ignores a different mint's pool", () => {
    expect(parseSwap(BUY, "11111111111111111111111111111111")).toBeNull();
  });

  it("returns null for a missing transaction", () => {
    expect(parseSwap(null, BASE)).toBeNull();
  });
});

describe("aggregates refuse what they cannot back", () => {
  const recent = { ...parseSwap(BUY, BASE)!, blockTime: Math.floor(Date.now() / 1000) - 60 };
  const older = { ...parseSwap(SELL, BASE)!, blockTime: Math.floor(Date.now() / 1000) - 120 };

  it("a failed read is null, not zero", () => {
    expect(volume24h(null)).toBeNull();
    expect(totalVolume(null)).toBeNull();
    expect(change24hPct(null)).toBeNull();
    expect(pricePoints(null)).toEqual([]);
  });

  it("a complete read with no trades really is zero", () => {
    expect(volume24h(history([]))).toBe(0);
    expect(totalVolume(history([]))).toBe(0);
  });

  it("sums a complete window", () => {
    expect(volume24h(history([recent, older]))).toBeCloseTo(0.51, 9);
  });

  it("stands down when any transaction was unreadable", () => {
    const holey = history([recent, older], { missed: 2 });
    expect(volume24h(holey)).toBeNull();
    expect(totalVolume(holey)).toBeNull();
    // The trades themselves are still true, so the chart keeps its points.
    expect(pricePoints(holey)).toHaveLength(2);
  });

  it("refuses a total when history is truncated", () => {
    expect(totalVolume(history([recent], { truncated: true }))).toBeNull();
  });

  it("still answers 24h when truncation is older than the window", () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 60 * 30;
    const h = history([recent], { truncated: true, oldestBlockTime: old });
    expect(volume24h(h)).toBeCloseTo(0.5, 9);
  });

  it("refuses 24h when truncation falls inside the window", () => {
    const inside = Math.floor(Date.now() / 1000) - 60 * 60;
    const h = history([recent], { truncated: true, oldestBlockTime: inside });
    expect(volume24h(h)).toBeNull();
  });

  it("needs two points for a change, not one", () => {
    expect(change24hPct(history([recent]))).toBeNull();
    expect(change24hPct(history([recent, older]))).not.toBeNull();
  });

  it("orders chart points oldest first", () => {
    const points = pricePoints(history([recent, older]));
    expect(points[0].t).toBeLessThan(points[1].t);
  });
});
