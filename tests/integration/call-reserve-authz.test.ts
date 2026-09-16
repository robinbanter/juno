import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  releaseMppCallEscrow,
  reserveMppCallEscrow,
  settleMppCallEscrow,
} from "@/lib/custodial";
import { getDb } from "@/lib/db";
import { userBalances } from "@/lib/db/schema";

/**
 * A call reserve must authorise against the wallet — under the balance-row lock.
 *
 * The regression this pins: `reserveMppCallEscrow` used to take
 * `pg_advisory_xact_lock` keyed on the reserve *reference*
 * (thread+call+tick) and then escrow with no balance check at all:
 *
 *     availableBalance: sql`... - ${amount}`,
 *     escrowedBalance:  sql`... + ${amount}`,   // <- unconditional
 *
 * The reference lock makes a repeat of the same tick idempotent, but it never
 * touches `user_balances`, so it cannot serialize against a withdrawal. The only
 * check lived in the route, as an unlocked read *before* this call — a
 * check-then-act window where a concurrent withdrawal can escrow the wallet dry
 * in between. Unlock and withdraw had the same shape; both were fixed by routing
 * the decision through `checkAndEscrow`, which decides under `SELECT … FOR
 * UPDATE`. This is the call path's turn.
 *
 * Testing that window over HTTP is not reliable — it's a genuine race, and which
 * side commits first is timing. So pin the property that closes it instead: the
 * reserve itself refuses a spend the wallet cannot cover, regardless of what any
 * caller checked beforehand. Passing `onChainUnits: 0n` says "the wallet is
 * empty" — the pre-fix code reserved anyway.
 */

const db = (() => {
  try {
    return process.env.DATABASE_URL ? getDb() : null;
  } catch {
    return null;
  }
})();

const thread = db
  ? await db.query.threads.findFirst({ columns: { id: true, fanId: true, creatorId: true } })
  : null;

describe.skipIf(!thread)("call reserve authorisation", () => {
  it("refuses to escrow against an empty wallet", async () => {
    const t = thread!;
    const before = await getDb().query.userBalances.findFirst({
      where: eq(userBalances.userId, t.fanId),
      columns: { escrowedBalance: true },
    });

    const result = await reserveMppCallEscrow({
      fanId: t.fanId,
      creatorId: t.creatorId,
      threadId: t.id,
      // A reference no run has used before. A FIXED id would be reserved by the
      // first run that reaches the escrow, and every later run would then
      // short-circuit on idempotency (`already_reserved`) before the balance
      // check ran — the test would pass while testing nothing.
      callId: randomUUID(),
      tick: 999_001,
      chargedSeconds: 60,
      amount: "3.00000000",
      onChainUnits: BigInt(0), // the wallet is empty
    });

    expect(result.status).toBe("insufficient_funds");

    // And nothing was reserved — a refused spend must not move the ledger.
    const after = await getDb().query.userBalances.findFirst({
      where: eq(userBalances.userId, t.fanId),
      columns: { escrowedBalance: true },
    });
    expect(Number(after?.escrowedBalance ?? 0)).toBeCloseTo(
      Number(before?.escrowedBalance ?? 0),
      6,
    );
  }, 60_000);

  it("refuses a spend larger than the wallet holds", async () => {
    const t = thread!;
    const result = await reserveMppCallEscrow({
      fanId: t.fanId,
      creatorId: t.creatorId,
      threadId: t.id,
      callId: randomUUID(),
      tick: 999_002,
      chargedSeconds: 60,
      amount: "3.00000000",
      onChainUnits: BigInt(2_999_999), // $2.999999 — one atomic unit short
    });

    expect(result.status).toBe("insufficient_funds");
  }, 60_000);
  /**
   * A settled reservation cannot also be released.
   *
   * Settling credits the creator but does NOT delete the `mpp_call_debit` reserve
   * rows, so `getReservedMppCallAmount` kept reporting the full amount afterwards
   * and a release refunded it a second time. The two also locked on different
   * keys — `settleRef` vs `settleRef:release` — so they never serialized.
   *
   * This needed no race at all. Measured, plain sequential:
   *
   *     reserve $1 -> escrow  1
   *     settle     -> escrow  0   (creator credited $1)
   *     release    -> escrow -1   (fan refunded $1)
   *
   * Negative escrow is phantom money: spendable is `on-chain − escrow`, so −1
   * escrow hands the fan a dollar that does not exist — while the creator has
   * already been paid for the call. The route exposes both `settle` and
   * `release` as client actions, so a fan could drive this themselves.
   */
  it("does not release an escrow that was already settled", async () => {
    const t = thread!;
    const callId = randomUUID();
    const escrowOf = async () =>
      Number(
        (
          await getDb().query.userBalances.findFirst({
            where: eq(userBalances.userId, t.fanId),
            columns: { escrowedBalance: true },
          })
        )?.escrowedBalance ?? 0,
      );

    const before = await escrowOf();

    const reserved = await reserveMppCallEscrow({
      fanId: t.fanId,
      creatorId: t.creatorId,
      threadId: t.id,
      callId,
      tick: 1,
      chargedSeconds: 20,
      amount: "1.00000000",
      onChainUnits: BigInt(50_000_000), // $50 — the wallet is not the subject here
    });
    expect(reserved.status).toBe("reserved");
    expect(await escrowOf()).toBeCloseTo(before + 1, 6);

    const settled = await settleMppCallEscrow({
      fanId: t.fanId,
      creatorId: t.creatorId,
      threadId: t.id,
      callId,
      paymentTxHash: "A".repeat(52),
    });
    expect(settled.status).toBe("settled");
    expect(await escrowOf()).toBeCloseTo(before, 6);

    // The release must decline — the money is already gone to the creator.
    const released = await releaseMppCallEscrow({
      fanId: t.fanId,
      threadId: t.id,
      callId,
    });
    expect(released).toBeNull();

    const after = await escrowOf();
    expect(after).toBeCloseTo(before, 6);
    // The invariant underneath it all: escrow backs real money, so it can never
    // go negative — that is what turns a refund into invented balance.
    expect(after).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
