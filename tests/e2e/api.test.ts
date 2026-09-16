import { describe, it, expect } from "vitest";
import { waitForServer } from "../helpers/server";

/**
 * End-to-end API tests against a running app (`npm run dev`).
 * Skipped automatically when the server isn't up.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);

const PLATFORM = process.env.DEPLOYER_ADDRESS ?? "";

describe.skipIf(!serverUp)("e2e: auth gating", () => {
  it("redirects a protected page to /sign-in when signed out", async () => {
    const r = await fetch(`${BASE}/profile`, { redirect: "manual" });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/sign-in");
  });

  it("401s a protected API when signed out", async () => {
    const r = await fetch(`${BASE}/api/user`, { redirect: "manual" });
    expect(r.status).toBe(401);
  });

  // Generous timeout: a dev server compiles each route on first hit.
  it(
    "serves public pages",
    async () => {
      const paths = ["/", "/sign-in", "/terms", "/privacy"];
      const statuses = await Promise.all(
        paths.map((p) => fetch(`${BASE}${p}`).then((r) => r.status)),
      );
      expect(statuses).toEqual(paths.map(() => 200));
    },
    120_000,
  );
});

describe.skipIf(!serverUp)("e2e: privy session endpoint", () => {
  it("requires a token", async () => {
    const r = await fetch(`${BASE}/api/auth/privy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(400);
  });

  it("rejects an unverifiable token", async () => {
    const r = await fetch(`${BASE}/api/auth/privy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-privy-jwt" }),
    });
    expect(r.status).toBe(401);
  });

  it("clears the session on DELETE", async () => {
    const r = await fetch(`${BASE}/api/auth/privy`, { method: "DELETE" });
    expect(r.status).toBe(200);
    const cookies = r.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("zorr_session=");
  });
});

describe.skipIf(!serverUp)("e2e: wallet balance endpoint", () => {
  it("rejects an invalid address", async () => {
    const r = await fetch(`${BASE}/api/wallet/balance?address=not-an-address`);
    expect(r.status).toBe(400);
  });

  it("requires an address", async () => {
    expect((await fetch(`${BASE}/api/wallet/balance`)).status).toBe(400);
  });

  it.skipIf(!PLATFORM)("reads the platform wallet's on-chain balances", async () => {
    const r = await fetch(`${BASE}/api/wallet/balance?address=${PLATFORM}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.address).toBe(PLATFORM);
    // ALGO: the platform pays gas and seeds user wallets out of this.
    expect(Number(body.algo)).toBeGreaterThan(0);
    // USDC: the platform is opted in so it can RECEIVE unlock revenue, but it
    // holds no float — it doesn't sell USDC and starts at zero. (Under the old
    // self-minted ASA it held the entire supply; that treasury is gone.)
    expect(body.optedIn).toBe(true);
    expect(Number(body.usdc)).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!serverUp)("e2e: signed-in account + custodial wallet", () => {
  async function devSession() {
    const login = await fetch(`${BASE}/api/dev/login`, { method: "POST" });
    if (login.status !== 200) return null;
    return (login.headers.get("set-cookie") ?? "").split(";")[0];
  }

  it("provisions a custodial Algorand wallet and reports a balance", async () => {
    const cookie = await devSession();
    if (!cookie) return; // dev auth only exists in development
    const r = await fetch(`${BASE}/api/account`, { headers: { cookie } });
    expect(r.status).toBe(200);
    const { account } = await r.json();

    // The single wallet shown everywhere: a real 58-char Algorand address.
    expect(account.tempoWalletAddress).toMatch(/^[A-Z2-7]{58}$/);
    expect(Number(account.availableBalance)).toBeGreaterThanOrEqual(0);
    expect(Number(account.escrowedBalance)).toBeGreaterThanOrEqual(0);
  });

  it("the custodial wallet's on-chain balance matches the reported balance", async () => {
    const cookie = await devSession();
    if (!cookie) return;
    const { account } = await fetch(`${BASE}/api/account`, { headers: { cookie } }).then(
      (r) => r.json(),
    );
    const chain = await fetch(
      `${BASE}/api/wallet/balance?address=${account.tempoWalletAddress}`,
    ).then((r) => r.json());

    // available = on-chain ASA balance − escrow (the ledger mirrors the chain).
    const expected = Number(chain.usdc) - Number(account.escrowedBalance);
    expect(Number(account.availableBalance)).toBeCloseTo(expected, 2);
  });
});

describe.skipIf(!serverUp)("e2e: malformed input never crashes a route", () => {
  // Regression: a non-uuid id reached Postgres, which throws on a uuid column,
  // and the unhandled error surfaced as a 500 — on /api/unlock and /api/tip
  // among others. A malformed id can't name a row, so 404 is the honest answer.
  const cookie = "veil_dev_auth=default";

  const cases: [string, string, unknown][] = [
    ["unlock with a non-uuid postId", "/api/unlock", { postId: "x" }],
    ["tip with a non-uuid postId", "/api/tip", { postId: "x", amount: "1" }],
    ["follow with a numeric username", "/api/follow", { username: 42 }],
    ["follow with a non-uuid userId", "/api/follow", { userId: "nope" }],
    ["region unlock with garbage ids", "/api/unlock/region", { postId: "x", regionId: "x" }],
  ];

  for (const [name, path, body] of cases) {
    it(`${name} → not a 500`, async () => {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status, `${path} crashed`).not.toBe(500);
      expect(res.status).toBeLessThan(500);
    }, 30_000);
  }
});

describe.skipIf(!serverUp)("e2e: a NUL byte never crashes a route", () => {
  // Postgres text cannot hold 0x00; the driver throws and it surfaced as a 500
  // on search (no account needed), bio, comments and report detail.
  const NUL = "bad" + String.fromCharCode(0) + "text";

  it("search survives it — this route needs no account", async () => {
    const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(NUL)}`);
    expect(res.status).not.toBe(500);
  }, 30_000);

  it("profile bio survives it", async () => {
    const res = await fetch(`${BASE}/api/user`, {
      method: "PATCH",
      headers: { cookie: "veil_dev_auth=default", "content-type": "application/json" },
      body: JSON.stringify({ bio: NUL }),
    });
    expect(res.status).not.toBe(500);
  }, 30_000);
});
