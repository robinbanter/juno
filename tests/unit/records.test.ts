import { describe, it, expect, vi, afterEach } from "vitest";
import { recordsRequired } from "@/lib/moderation/records";

/**
 * §2257 enforcement config.
 *
 * The database-backed check needs a live DB and is covered end to end; what's
 * pinned here is the switch itself, because the failure mode is silent: if
 * `recordsRequired()` ever returned false when it was configured true, creators
 * would publish with no age record on file and nothing would look broken.
 */
describe("§2257 record enforcement", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default — local dev cannot produce real ID documents", () => {
    vi.stubEnv("REQUIRE_2257_RECORDS", "");
    expect(recordsRequired()).toBe(false);
  });

  it("turns on when explicitly enabled", () => {
    vi.stubEnv("REQUIRE_2257_RECORDS", "true");
    expect(recordsRequired()).toBe(true);
  });

  it("is not fooled by an empty env var", () => {
    // `FOO=` in a .env is an empty string, not undefined — `??` would keep it and
    // `"" === "true"` is false, so this happens to be safe, but pin it: the same
    // pattern silently broke content scanning.
    vi.stubEnv("REQUIRE_2257_RECORDS", "   ");
    expect(recordsRequired()).toBe(false);
  });

  it("only accepts an explicit 'true', never a truthy-looking string", () => {
    // "yes"/"1"/"on" must NOT enable it: a config that half-works is worse than
    // one that plainly doesn't, because you'd believe you were enforcing.
    for (const value of ["yes", "1", "on", "TRUE "]) {
      vi.stubEnv("REQUIRE_2257_RECORDS", value);
      expect(recordsRequired(), `"${value}"`).toBe(value.trim().toLowerCase() === "true");
    }
  });
});
