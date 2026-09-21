import { describe, expect, it } from "vitest";

/**
 * Live checks against Tessera's public API and Solana mainnet.
 *
 * In `integration/` rather than `unit/` because both are real network calls to
 * a third party. The unit suite is hermetic and one of its files stubs the
 * global `fetch`, which these would silently inherit — a probe that asserts a
 * real endpoint answers is worthless if it is talking to a mock.
 */

/**
 * Live checks against Tessera's public API and mainnet.
 *
 * Not a unit test of pure logic — these assert that the two things Juno now
 * depends on are actually true: the mark endpoint answers without a key, and
 * the mint says what the reader claims it says. Both are third-party and both
 * would fail silently if they changed.
 */
describe("tessera", () => {
  it("reads every published T-token with a usable mark", async () => {
    const { tesseraTokens } = await import("@/lib/juno/tessera");
    const tokens = await tesseraTokens();

    expect(tokens.length).toBeGreaterThanOrEqual(3);
    for (const token of tokens) {
      expect(token.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(token.markPrice).toBeGreaterThan(0);
      expect(token.holders).toBeGreaterThan(0);
      expect(token.markValuation).toBeGreaterThan(0);
    }
    const ids = tokens.map((t) => t.id).sort();
    console.log("TESSERA TOKENS:", JSON.stringify(tokens, null, 1));
    expect(ids).toContain("T-OpenAI");
    expect(ids).toContain("T-Kalshi");
  });

  it("resolves one token by id, case-insensitively, and refuses an unknown one", async () => {
    const { tesseraToken } = await import("@/lib/juno/tessera");
    expect((await tesseraToken("t-openai"))?.id).toBe("T-OpenAI");
    expect((await tesseraToken("tessera:T-SpaceX"))?.id).toBe("T-SpaceX");
    expect(await tesseraToken("T-NotAThing")).toBeNull();
  });

  it("reads the mint's own transfer fee rather than repeating the docs", async () => {
    const { tesseraTokens, tesseraOnChain } = await import("@/lib/juno/tessera");
    const [first] = await tesseraTokens();
    const facts = await tesseraOnChain(first.mint);

    expect(facts, "mainnet read of the T-token mint").not.toBeNull();
    console.log("ON-CHAIN:", JSON.stringify(facts, null, 1));

    // Token-2022, not SPL Token — which is the whole reason a fee is possible.
    expect(facts!.tokenProgram).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    expect(facts!.decimals).toBe(9);
    expect(facts!.extensions).toContain("transferFeeConfig");
    expect(facts!.transferFeeBps).toBeGreaterThan(0);
    // The reason it cannot be a DBC quote mint, derived and not asserted.
    expect(facts!.blocked).toContain("transfer fee");
  });

  it("agrees with the API about supply", async () => {
    const { tesseraTokens, tesseraOnChain } = await import("@/lib/juno/tessera");
    const [first] = await tesseraTokens();
    if (first.supply === null) return; // `/tokens` did not answer; nothing to compare.
    const facts = await tesseraOnChain(first.mint);
    const onChain = Number(facts!.supplyRaw) / 10 ** facts!.decimals;
    // Within a whisker — the two are read moments apart and minting is live.
    expect(Math.abs(onChain - first.supply) / first.supply).toBeLessThan(0.01);
  });
});
