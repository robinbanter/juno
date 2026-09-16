import { describe, it, expect } from "vitest";
import { isUuid } from "@/lib/db/ids";

/**
 * A malformed id must be "not found", never a crash.
 *
 * Postgres throws `invalid input syntax for type uuid` when garbage reaches a
 * uuid column, and Drizzle passes it straight through — that turned
 * `{"postId":"x"}` into an unhandled 500 on four routes, two of them money
 * paths. The guard lives in the query layer so every caller is covered,
 * including routes not written yet.
 */
describe("uuid guard", () => {
  it("accepts a real uuid", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid("4f291d12-ad7e-42b7-825f-84223c3f849a")).toBe(true);
    expect(isUuid("4F291D12-AD7E-42B7-825F-84223C3F849A")).toBe(true); // case-insensitive
  });

  it("rejects the shapes that used to reach Postgres and throw", () => {
    for (const bad of ["x", "", "nope", "1", "'; drop table posts; --"]) {
      expect(isUuid(bad), `"${bad}"`).toBe(false);
    }
  });

  it("rejects non-strings — a body cast is not a check", () => {
    // Routes cast `(await req.json()) as { postId?: string }`, which asserts
    // nothing at runtime: a number arrives as a number.
    for (const bad of [42, null, undefined, {}, [], true, { $gt: 0 }]) {
      expect(isUuid(bad), String(bad)).toBe(false);
    }
  });

  it("rejects near-misses rather than trusting length alone", () => {
    expect(isUuid("00000000-0000-0000-0000-00000000000")).toBe(false); // short
    expect(isUuid("00000000-0000-0000-0000-0000000000000")).toBe(false); // long
    expect(isUuid("zzzzzzzz-0000-0000-0000-000000000000")).toBe(false); // non-hex
    expect(isUuid("000000000000000000000000000000000000")).toBe(false); // no dashes
  });
});
