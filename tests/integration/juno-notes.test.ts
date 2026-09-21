import { describe, expect, it } from "vitest";

/**
 * A live check of the signature join, against the real comment store.
 *
 * In `integration/` because it needs a database: the unit suite is meant to
 * run anywhere, and this asserts a fact about data that has to already exist.
 */

/**
 * A live check of the signature join, run against the real store.
 *
 * Not a unit test of pure logic — it is the one link in the announcement path
 * that nothing else exercises: a comment written with a transaction signature
 * has to come back when the feed asks for that signature. Skipped without a
 * database, so the suite still runs on a machine that has none.
 */
const live = !!process.env.MONGODB_URI;

describe.skipIf(!live)("notesForSignatures", () => {
  it("returns the note written against a real landed signature", async () => {
    const { notesForSignatures } = await import("@/lib/juno/social");
    const landed =
      "SyQBtcxSXT4qHznKxGd45142Khsy47ugvgT9WALSa3NXaswfexUSmipKSFvdwf3171RNSXsVT9YqFbpFLYxJU5P";
    const missing = "notASignature111111111111111111111111111111111111111111111111111111111111";

    const map = await notesForSignatures([landed, missing], "devnet");

    const note = map.get(landed);
    expect(note, "the announcement written against this fill").toBeDefined();
    expect(note!.side).toBe("buy");
    expect(note!.body.length).toBeGreaterThan(0);
    // A signature with nothing said about it stays absent rather than empty.
    expect(map.has(missing)).toBe(false);
  });
});
