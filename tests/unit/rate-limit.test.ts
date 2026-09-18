import { describe, it, expect, vi, afterEach } from "vitest";
import { check, rateLimit, LIMITS } from "@/lib/rate-limit";

/**
 * The limiter's logic, tested directly.
 *
 * This lives in a unit test rather than e2e on purpose: `rateLimit()` relaxes
 * limits outside production (so a dev server or the e2e suite isn't throttled),
 * which would make an end-to-end assertion of the *threshold* meaningless.
 * `check()` is the pure core and is not relaxed — so this is where the real
 * behaviour gets pinned.
 */
describe("rate limiter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows exactly `limit` requests, then blocks", () => {
    const key = `test:allow:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(check(key, 3, 60_000).ok, `request ${i + 1} of 3 should pass`).toBe(true);
    }
    expect(check(key, 3, 60_000).ok, "the 4th must be blocked").toBe(false);
  });

  it("reports how many requests remain", () => {
    const key = `test:remaining:${Math.random()}`;
    expect(check(key, 3, 60_000).remaining).toBe(2);
    expect(check(key, 3, 60_000).remaining).toBe(1);
    expect(check(key, 3, 60_000).remaining).toBe(0);
  });

  it("tells a blocked caller when to retry, never zero seconds", () => {
    const key = `test:retry:${Math.random()}`;
    check(key, 1, 60_000);
    const blocked = check(key, 1, 60_000);
    expect(blocked.ok).toBe(false);
    // A Retry-After of 0 invites an immediate hammer loop.
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("isolates callers — one user cannot exhaust another's budget", () => {
    const a = `test:iso:a:${Math.random()}`;
    const b = `test:iso:b:${Math.random()}`;
    expect(check(a, 1, 60_000).ok).toBe(true);
    expect(check(a, 1, 60_000).ok).toBe(false); // a is spent
    expect(check(b, 1, 60_000).ok).toBe(true); // b is untouched
  });

  it("frees the window once it expires", async () => {
    const key = `test:window:${Math.random()}`;
    expect(check(key, 1, 50).ok).toBe(true);
    expect(check(key, 1, 50).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(check(key, 1, 50).ok, "a new window should start clean").toBe(true);
  });

  it("keeps the endpoints that spend Pinata or RPC quota tightly bounded", () => {
    // Each of these costs something per call: a pin, or an RPC read.
    expect(LIMITS.upload.limit).toBeLessThanOrEqual(20);
    expect(LIMITS.metadata.limit).toBeLessThanOrEqual(20);
    expect(LIMITS.poolRecord.limit).toBeLessThanOrEqual(10);
    expect(LIMITS.signIn.limit).toBeLessThanOrEqual(10);
    expect(LIMITS.poolRecord.windowMs).toBe(60_000);
  });

  it("enforces the real limit in production, and only relaxes outside it", () => {
    // The relaxation exists so a dev server / e2e run isn't throttled. This is
    // the assertion that it never leaks into production, where the whole point
    // is to bound an attacker.
    vi.stubEnv("NODE_ENV", "production");
    const key = `prod:${Math.random()}`;
    let blocked = 0;
    for (let i = 0; i < 13; i++) if (rateLimit(key, LIMITS.poolRecord)) blocked++;
    // 10 allowed, 3 rejected — the configured limit, not a multiple of it.
    expect(blocked).toBe(3);

    vi.stubEnv("NODE_ENV", "development");
    const devKey = `dev:${Math.random()}`;
    let devBlocked = 0;
    for (let i = 0; i < 13; i++) if (rateLimit(devKey, LIMITS.poolRecord)) devBlocked++;
    expect(devBlocked).toBe(0);
  });

  it("returns 429 with a Retry-After header a client can obey", () => {
    vi.stubEnv("NODE_ENV", "production");
    const key = `hdr:${Math.random()}`;
    for (let i = 0; i < LIMITS.poolRecord.limit; i++) rateLimit(key, LIMITS.poolRecord);
    const res = rateLimit(key, LIMITS.poolRecord);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(Number(res!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
