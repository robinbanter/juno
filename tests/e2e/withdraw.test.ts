import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import { waitForServer, devCookie } from "../helpers/server";

/**
 * The money-OUT path: send the user's USDC to a wallet they control.
 *
 * This is the highest-consequence endpoint in the app — it moves real funds to
 * an address supplied in the request body — so most of these assert that BAD
 * withdrawals are refused, not that good ones work.
 *
 * The transfer test only runs when the wallet actually holds the payment asset.
 * TestNet USDC comes from Circle's captcha-gated faucet, so to exercise the real
 * transfer locally, point USDC_ASSET_ID_OVERRIDE at an asset the dev wallet
 * already holds — the code path is identical apart from the asset id.
 *
 * Needs `npm run dev`.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);

const cookie = serverUp ? await devCookie(BASE) : null;

async function account() {
  const r = await fetch(`${BASE}/api/account`, {
    headers: { cookie: cookie! },
    cache: "no-store",
  });
  return (await r.json()).account as {
    availableBalance: string;
    escrowedBalance: string;
    tempoWalletAddress: string;
  };
}

/**
 * Wait until no money is in flight — escrow back to zero.
 *
 * Escrow is shared, and unlock settles in `after()`, so a previous test FILE's
 * settlement lands in the middle of this one. That is what broke the leak check
 * below: it captured escrow 4 (an in-flight $4 unlock) and read 0 after the
 * settlement finished — `expected +0 to be 4`. Nothing leaked; the baseline
 * moved.
 *
 * Polling for a STABLE value is not enough, and that was the first fix's
 * mistake: an on-chain settlement holds escrow at 4 for seconds, so consecutive
 * reads agree and call it steady right before it drops. Zero is the only value
 * that actually means "nothing is pending" — and it is what makes the assertion
 * mean something, since a leaked reservation shows up as exactly 0.01.
 */
async function waitForIdleEscrow(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let acct = await account();
  while (Number(acct.escrowedBalance) !== 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_000));
    acct = await account();
  }
  return acct;
}

function withdraw(body: unknown, c: string | null = cookie) {
  return fetch(`${BASE}/api/account/withdraw`, {
    method: "POST",
    headers: { ...(c ? { cookie: c } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PLATFORM = process.env.DEPLOYER_ADDRESS ?? "";
const balance = serverUp && cookie ? Number((await account()).availableBalance) : 0;

// Say so, loudly, when the money tests are about to evaporate.
//
// These suites gate on `balance <= 0`, and the e2e run SPENDS the shared wallet
// — so an empty wallet is the normal end state, and the next run skips the
// double-spend guards while still reporting green. That is exactly how a real
// flake hid: three consecutive "passes" here were twelve skips. A skipped money
// test is not a passing money test; fund the wallet and run it again.
/**
 * Skip THIS test, now, if the wallet cannot fund it.
 *
 * `balance` above is read once, at file load. That is a snapshot, and the suite
 * invalidates it as it goes: the e2e run SPENDS the shared wallet, so a file
 * that loads funded can reach its money tests broke. The tests then ran against
 * $0 instead of skipping, and asserted things that are only true with money —
 * the double-spend race asserts exactly one of (unlock, drain) wins, but with an
 * empty wallet BOTH are refused, `winners` is 0, and it fails while saying
 * nothing at all about the lock it exists to test.
 *
 * That is the flake: the same suite passed, failed, and skipped across three
 * consecutive runs depending only on when the wallet ran dry. Read the balance
 * when the test actually runs.
 */
async function skipUnlessFunded(ctx: { skip: () => void }, need = 0.000001) {
  const live = Number((await account()).availableBalance);
  if (live < need) {
    process.stderr.write(
      `\n\u26a0\ufe0f  wallet is empty (${live}) by the time this test ran — SKIPPED, not passing.\n` +
        `   The e2e run spends the shared wallet; fund it and run this file alone.\n\n`,
    );
    ctx.skip();
  }
  return live;
}

if (serverUp && cookie && balance <= 0) {
  // stderr directly, not console.warn: vitest buffers module-scope console
  // output and drops it when nothing in the file fails — so the warning about
  // silent skipping was itself silently skipped.
  process.stderr.write(
    `\n\u26a0\ufe0f  withdraw e2e: wallet is empty (${balance}) — the transfer and ` +
      `double-spend suites are SKIPPED, not passing.\n` +
      `   Fund the fan's custodial wallet with TestNet USDC to run them.\n\n`,
  );
}

describe.skipIf(!serverUp || !cookie)("e2e: withdrawing USDC out", () => {
  it("requires authentication", async () => {
    const r = await withdraw({ to: PLATFORM, amount: "1" }, null);
    expect(r.status).toBe(401);
  });

  it("requires both an address and an amount", async () => {
    expect((await withdraw({})).status).toBe(400);
    expect((await withdraw({ to: PLATFORM })).status).toBe(400);
    expect((await withdraw({ amount: "1" })).status).toBe(400);
  });

  it("rejects malformed addresses, including a bad checksum", async () => {
    // "A"×58 is the right shape and alphabet but a bad checksum — the kind of
    // typo that would otherwise send funds into the void.
    for (const to of ["nope", "0x1234", "A".repeat(58)]) {
      const r = await withdraw({ to, amount: "1" });
      expect(r.status, `should reject "${to}"`).toBe(400);
      expect((await r.json()).code).toBe("invalid_address");
    }
  });

  it("treats a blank address as missing rather than invalid", async () => {
    const r = await withdraw({ to: "   ", amount: "1" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/required/i);
  });

  it("rejects amounts that aren't positive numbers", async () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      const r = await withdraw({ to: PLATFORM, amount });
      expect(r.status, `should reject "${amount}"`).toBe(400);
    }
  });

  it("refuses to withdraw to the wallet's own address", async () => {
    const { tempoWalletAddress } = await account();
    const r = await withdraw({ to: tempoWalletAddress, amount: "1" });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("same_wallet");
  });

  it(
    "refuses a recipient that hasn't opted in — their funds would bounce",
    async (ctx) => {
      await skipUnlessFunded(ctx, 0.01);
      // A fresh account can't hold the asset. Sending anyway means the network
      // rejects the transfer, so this must be caught BEFORE it's submitted.
      // (Needs a funded wallet: the balance check runs first and would otherwise
      // short-circuit with insufficient_funds.)
      const fresh = algosdk.generateAccount().addr.toString();
      const r = await withdraw({ to: fresh, amount: "0.01" });
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("recipient_not_opted_in");
    },
    30_000,
  );

  it("reports insufficient funds cleanly on an empty wallet", async () => {
    // Regression: the balance cap used to run the spendable amount through a
    // parser that rejects "0", so an empty wallet threw and surfaced as a 502
    // "Invalid amount" instead of a plain "you have nothing to withdraw".
    const { availableBalance } = await account();
    const r = await withdraw({ to: PLATFORM, amount: String(Number(availableBalance) + 1) });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("insufficient_funds");
  }, 30_000);

  it("caps the withdrawal at the spendable balance", async () => {
    const { availableBalance } = await account();
    const r = await withdraw({ to: PLATFORM, amount: "999999" });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.code).toBe("insufficient_funds");
    // The error tells the user the real ceiling rather than just "no".
    expect(body.error).toContain(availableBalance);
  }, 30_000);

  it.skipIf(!PLATFORM)(
    "sends the asset on-chain and the balance drops by exactly that much",
    async (ctx) => {
      await skipUnlessFunded(ctx, 0.1);
      const before = await account();
      const amount = "0.10";

      const r = await withdraw({ to: PLATFORM, amount });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.txid).toMatch(/^[A-Z2-7]{52}$/); // a real Algorand txid
      expect(body.to).toBe(PLATFORM);

      // Balance is read back from the chain, not decremented in a ledger.
      expect(Number(body.availableBalance)).toBeCloseTo(
        Number(before.availableBalance) - Number(amount),
        6,
      );
      const after = await account();
      expect(Number(after.availableBalance)).toBeCloseTo(
        Number(before.availableBalance) - Number(amount),
        6,
      );
    },
    180_000,
  );
});

describe.skipIf(!serverUp || !cookie || !PLATFORM)(
  "e2e: a withdrawal cannot outrun an in-flight settlement",
  () => {
    it("refuses to drain money already committed to an unlock", async (ctx) => {
      // The race needs money on BOTH sides. With an empty wallet the unlock is
      // refused AND the drain is refused (a withdrawal of "0" is an invalid
      // amount), so `winners` is 0 and this fails — while proving nothing about
      // the lock. That is not a bug in the lock; it is this test running after
      // the suite spent the wallet.
      await skipUnlessFunded(ctx, 0.01);
      // Unlock settles asynchronously (in `after()`), so the naive fear is: buy
      // a post, immediately withdraw everything, settlement then fails for lack
      // of funds and the fan keeps the media for free.
      //
      // It can't happen because unlockWithCustodialBalance debits AND escrows in
      // one transaction — there is no window where the money is neither spent
      // nor reserved — and withdraw caps on (on-chain − escrow). This pins that.
      const before = await account();
      const owned = await fetch(`${BASE}/api/collection`, { headers: { cookie: cookie! } })
        .then((r) => r.json())
        .then((b) => new Set((b.items ?? []).map((i: { postId: string }) => i.postId)));

      const catalog = await fetch(`${BASE}/api/x402/posts`).then((r) => r.json());
      const target = catalog.resources.find(
        (r: { id: string; price: string }) =>
          Number(r.price.replace("$", "")) > 0 && !owned.has(r.id),
      );
      if (!target) return; // nothing unowned to buy; nothing to assert

      // Fire the unlock, then immediately try to take the FULL prior balance.
      const unlocking = fetch(`${BASE}/api/unlock`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ postId: target.id }),
      });

      const drain = await fetch(`${BASE}/api/account/withdraw`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ to: PLATFORM, amount: before.availableBalance }),
      });

      const unlocked = await unlocking;

      // Exactly ONE of them may win — never both.
      //
      // Which one is genuine timing: both race for the same `user_balances` row
      // lock, and whoever takes it first escrows while the other then sees that
      // escrow and is refused. Measured going each way: unlock 200 / drain 400,
      // and unlock 402 / drain 200. Both are correct.
      //
      // This used to assert `drain === 400 && unlock === 200`, which quietly
      // required the unlock to win. It passed alone and failed in the full suite
      // — not because the money was wrong, but because the loaded server let the
      // withdrawal reach the lock first. A test that encodes who wins a race is
      // testing the scheduler, not the invariant.
      //
      // The invariant is what the bug actually violated: before the fix BOTH
      // returned 200 and the fan kept the $4.00 media AND the whole $6.00.
      const winners = [unlocked.status === 200, drain.status === 200].filter(Boolean).length;
      expect(winners).toBe(1);

      if (drain.status !== 200) {
        expect(drain.status).toBe(400);
        expect((await drain.json()).code).toBe("insufficient_funds");
      } else {
        // The unlock lost, so it must have been refused for funds — not 500'd.
        expect(unlocked.status).toBe(402);
      }
    }, 180_000);
  },
);


describe.skipIf(!serverUp || !cookie)("e2e: a failed withdrawal never leaks its reservation", () => {
  it("leaves escrow untouched when the send is refused", async () => {
    // Withdrawal now reserves into escrow before sending. If a failure left that
    // reservation behind, the user's own money would be locked out of their
    // wallet permanently — a worse bug than the race it fixes.
    const fresh = algosdk.generateAccount().addr.toString();
    // Settle first: an unrelated in-flight settlement would move the baseline
    // out from under the comparison and read as a leak (or hide one).
    const before = await waitForIdleEscrow();
    // If this is not 0, something upstream leaked and the comparison below would
    // be measuring that instead of this withdrawal. Fail here, where it is clear.
    expect(Number(before.escrowedBalance)).toBe(0);

    const res = await withdraw({ to: fresh, amount: "0.01" });
    expect(res.status).toBe(400); // recipient not opted in

    // No wait: a leaked reservation is written synchronously with the refusal,
    // so waiting could only hide it.
    const after = await account();
    expect(Number(after.escrowedBalance)).toBe(Number(before.escrowedBalance));
    expect(Number(after.availableBalance)).toBeCloseTo(Number(before.availableBalance), 6);
  }, 60_000);
});
