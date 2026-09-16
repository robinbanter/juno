import { describe, it, expect, vi, afterEach } from "vitest";
import { persistUnlockOwnership } from "@/lib/unlock-ownership";

/**
 * An unlock is a purchase.
 *
 * This flag used to default to OFF, which made the unlock path DELETE the fan's
 * prior unlock row and charge them again — measured against a live wallet:
 * 10.20 -> 9.20 -> 8.20 for two unlocks of the SAME post. It also made every
 * fan's Collection permanently empty, since `getUnlockedPosts` short-circuits on
 * the same flag.
 *
 * The default is the whole test. If it ever flips back, fans pay for every view
 * of content they already own, silently, in real USDC.
 */
describe("unlock ownership", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("persists ownership by DEFAULT — a fan must never pay twice for one post", () => {
    vi.stubEnv("PERSIST_UNLOCK_OWNERSHIP", "");
    expect(persistUnlockOwnership()).toBe(true);
  });

  it("is not disabled by an empty env var", () => {
    // `FOO=` in a .env is an empty string, not undefined. `??` would keep it and
    // re-enable double charging; `||` is what makes the default hold.
    vi.stubEnv("PERSIST_UNLOCK_OWNERSHIP", "   ");
    expect(persistUnlockOwnership()).toBe(true);
  });

  it("stays on unless something explicitly says 'false'", () => {
    for (const value of ["true", "TRUE", "yes", "1", "off", "no"]) {
      vi.stubEnv("PERSIST_UNLOCK_OWNERSHIP", value);
      expect(persistUnlockOwnership(), `"${value}" must not disable ownership`).toBe(true);
    }
  });

  it("can still be forced off for a throwaway demo", () => {
    // The escape hatch remains, but it has to be deliberate and unambiguous.
    vi.stubEnv("PERSIST_UNLOCK_OWNERSHIP", "false");
    expect(persistUnlockOwnership()).toBe(false);
    vi.stubEnv("PERSIST_UNLOCK_OWNERSHIP", "FALSE");
    expect(persistUnlockOwnership()).toBe(false);
  });
});
