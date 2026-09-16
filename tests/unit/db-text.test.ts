import { describe, it, expect } from "vitest";
import { sanitizeDbText, sanitizeDbTextMax } from "@/lib/db/text";

const NUL = String.fromCharCode(0);

/**
 * Postgres `text` cannot hold 0x00 — the driver throws
 * `invalid byte sequence for encoding "UTF8": 0x00`, and nothing caught it. One
 * unprintable character produced an unhandled 500 on four routes: search
 * (reachable with no account), profile bio, comment body, and report detail.
 */
describe("db text guard", () => {
  it("strips the NUL byte that made Postgres throw", () => {
    expect(sanitizeDbText(`bad${NUL}text`)).toBe("badtext");
    expect(sanitizeDbText(NUL)).toBe("");
    expect(sanitizeDbText(`${NUL}${NUL}a${NUL}`)).toBe("a");
  });

  it("leaves ordinary text — including unicode — completely alone", () => {
    // The fix must not quietly mangle real content.
    for (const s of ["hello", "héllo wörld", "日本語", "emoji 🎉", "line\nbreak", "tab\there"]) {
      expect(sanitizeDbText(s)).toBe(s);
    }
  });

  it("returns '' for a non-string — a body cast is not a check", () => {
    for (const bad of [42, null, undefined, {}, [], true]) {
      expect(sanitizeDbText(bad)).toBe("");
    }
  });

  it("caps length — unbounded user text is paid for on every read, forever", () => {
    expect(sanitizeDbTextMax("abcdef", 3)).toBe("abc");
    expect(sanitizeDbTextMax("ab", 10)).toBe("ab");
    expect(sanitizeDbTextMax("x".repeat(5000), 2000)).toHaveLength(2000);
  });

  it("strips before capping, so a NUL can't consume the budget", () => {
    expect(sanitizeDbTextMax(`${NUL}${NUL}abc`, 3)).toBe("abc");
  });
});
