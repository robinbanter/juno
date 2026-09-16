import { describe, it, expect } from "vitest";
import { waitForServer, devCookie } from "../helpers/server";

/**
 * The metered-call money lifecycle: start -> connect -> reserve (escrow) ->
 * release. This path is independent of ElevenLabs (the API key only gates
 * /api/elevenlabs/conversation-token, the voice layer).
 *
 * Uses `release` rather than `settle` so the test is repeatable and spends no
 * TestNet funds; the settling path is verified on-chain separately.
 *
 * Needs `npm run dev` + seeded threads (`npm run seed`).
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);


const cookie = serverUp ? await devCookie(BASE) : null;

// The signed-in user must be the *fan* on the thread to bill a call.
async function fanThreadId(): Promise<string | null> {
  if (!cookie) return null;
  const r = await fetch(`${BASE}/api/messages`, { headers: { cookie } });
  if (!r.ok) return null;
  const { threads } = (await r.json()) as { threads?: { id: string }[] };
  for (const t of threads ?? []) {
    // `start` 403s when the caller isn't the fan — probe cheaply.
    const probe = await fetch(`${BASE}/api/messages/${t.id}/call`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    if (probe.status === 200) {
      const { call } = await probe.json();
      // release the probe's session so we start clean
      await fetch(`${BASE}/api/messages/${t.id}/call`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "release", callId: call.callId }),
      });
      return t.id;
    }
  }
  return null;
}

const threadId = serverUp && cookie ? await fanThreadId() : null;

// A null threadId is almost always an EMPTY WALLET, not a missing thread:
// `start` 402s below the minimum balance, so the probe above finds no thread it
// can bill and the whole suite skips while still reporting green. Say so —
// stderr directly, because vitest drops module-scope console output when nothing
// in the file fails.
if (serverUp && cookie && !threadId) {
  process.stderr.write(
    `\n\u26a0\ufe0f  call-escrow e2e: no billable thread — the call money suite is ` +
      `SKIPPED, not passing.\n` +
      `   Usually the fan's custodial wallet is empty (start needs the minimum ` +
      `balance). Fund it with TestNet USDC, or run \`npm run seed\`.\n\n`,
  );
}

async function account() {
  const r = await fetch(`${BASE}/api/account`, {
    headers: { cookie: cookie! },
    cache: "no-store",
  });
  return (await r.json()).account as {
    availableBalance: string;
    escrowedBalance: string;
  };
}

describe.skipIf(!serverUp || !cookie || !threadId)("e2e: call escrow lifecycle", () => {
  it("start -> connect -> reserve holds escrow, release returns it (no funds spent)", async () => {
    const call = (body: Record<string, unknown>) =>
      fetch(`${BASE}/api/messages/${threadId}/call`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const before = await account();

    // 1. start
    const started = await call({ action: "start" });
    expect(started.status).toBe(200);
    const { status, call: meta } = await started.json();
    expect(status).toBe("started");
    expect(meta.currency).toBe("USDC"); // not the retired Tempo "AlphaUSD"
    const callId = meta.callId;

    // 2. connect
    const connected = await call({ action: "connect", callId });
    expect(connected.status).toBe(200);
    expect((await connected.json()).status).toBe("connected");

    // 3. reserve — escrow is held, spendable drops, nothing is spent yet
    const reserved = await call({ action: "reserve", callId, tick: 1, chargedSeconds: 5 });
    expect(reserved.status).toBe(200);
    expect((await reserved.json()).status).toBe("reserved");

    const held = await account();
    expect(Number(held.escrowedBalance)).toBeGreaterThan(0);
    expect(Number(held.availableBalance)).toBeLessThan(Number(before.availableBalance));

    // 4. release — escrow returns, balance is exactly restored
    const released = await call({ action: "release", callId });
    expect(released.status).toBe(200);
    expect((await released.json()).status).toBe("released");

    const after = await account();
    expect(Number(after.escrowedBalance)).toBe(0);
    expect(Number(after.availableBalance)).toBeCloseTo(Number(before.availableBalance), 6);
  }, 120_000);

  /**
   * `balance` in a reserve response is SPENDABLE money, never the ledger mirror.
   *
   * The route used to forward `user_balances.available_balance` straight to the
   * client. That column is an audit trail, not a balance: a fan is only ever
   * debited there (their money arrives as an on-chain deposit, which never
   * credits the ledger), so it drifts permanently negative. A live reserve
   * returned `balance: "-10.05000000"` while the wallet held $9.
   *
   * Worse, it made the API contradict itself — the 402 challenge reported the
   * on-chain figure while the 200 reported the mirror, so an x402 client got a
   * different answer depending on whether it could afford the call.
   */
  it("reports spendable money as the balance, never a negative mirror", async () => {
    const call = (body: Record<string, unknown>) =>
      fetch(`${BASE}/api/messages/${threadId}/call`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const { call: meta } = await (await call({ action: "start" })).json();
    const callId = meta.callId;
    await call({ action: "connect", callId });

    try {
      // Let a couple of seconds accrue so the charge is non-zero.
      await new Promise((r) => setTimeout(r, 3_000));
      const reserved = await (await call({ action: "reserve", callId })).json();
      expect(reserved.status).toBe("reserved");

      const reportedBalance = Number(reserved.balance);
      expect(reportedBalance).toBeGreaterThanOrEqual(0);

      // It must be the same figure /api/account reports — both are
      // `on-chain − escrow`, i.e. what the NEXT tick may actually spend. The
      // reserve is already counted in escrow by this point, so the two agree.
      const spendable = Number((await account()).availableBalance);
      expect(reportedBalance).toBeCloseTo(spendable, 2);
    } finally {
      await call({ action: "release", callId });
    }
  }, 120_000);

  it("rejects an invalid action and a malformed callId", async () => {
    const bad = await fetch(`${BASE}/api/messages/${threadId}/call`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ action: "drain-wallet", callId: "x".repeat(10) }),
    });
    expect(bad.status).toBe(400);

    const badId = await fetch(`${BASE}/api/messages/${threadId}/call`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ action: "reserve", callId: "!!", tick: 1 }),
    });
    expect(badId.status).toBe(400);
  }, 60_000);
});
