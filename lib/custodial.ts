import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  custodialLedger,
  loyaltyLedger,
  regionUnlocks,
  tips,
  unlocks,
  userBalances,
  users,
} from "./db/schema";
import { POINTS_PER_UNLOCK } from "./constants";
import {
  internalAddress,
  internalReference,
  internalTxHash,
} from "./custodial/identifiers";
import {
  mppCallReserveReference,
  mppCallReserveReferenceLike,
  mppCallSettleReference,
} from "./custodial/mpp-call-references";
import { persistUnlockOwnership } from "./unlock-ownership";
import { checkAndEscrow, unitsToUsd, usdToUnits } from "./spend-reservation";
export { normalizeMoney } from "./custodial/money";

export const CUSTODIAL_ACCOUNT_COOKIE = "veil_account";

export type CustodialAccount = {
  userId: string;
  availableBalance: string;
  escrowedBalance: string;
};

export type CustodialUnlockResult =
  | { status: "already_unlocked"; txHash?: string }
  | { status: "unlocked"; txHash: string; balance: string }
  | { status: "insufficient_funds"; balance: string; required: string };



export async function createCustodialAccount(): Promise<CustodialAccount> {
  return getDb().transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ walletAddress: internalAddress() })
      .returning();

    const [balance] = await tx
      .insert(userBalances)
      .values({ userId: user.id })
      .returning();

    return {
      userId: user.id,
      availableBalance: balance.availableBalance,
      escrowedBalance: balance.escrowedBalance,
    };
  });
}

export async function getCustodialAccount(
  userId: string | undefined,
): Promise<CustodialAccount | null> {
  if (!userId) return null;

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return null;

  const balance = await db.query.userBalances.findFirst({
    where: eq(userBalances.userId, user.id),
  });

  if (!balance) {
    const [created] = await db
      .insert(userBalances)
      .values({ userId: user.id })
      .onConflictDoNothing()
      .returning();

    return {
      userId: user.id,
      availableBalance: created?.availableBalance ?? "0",
      escrowedBalance: created?.escrowedBalance ?? "0",
    };
  }

  return {
    userId: user.id,
    availableBalance: balance.availableBalance,
    escrowedBalance: balance.escrowedBalance,
  };
}

export async function getOrCreateCustodialAccount(userId: string | undefined) {
  return (await getCustodialAccount(userId)) ?? createCustodialAccount();
}

export async function withdrawCustodialBalance(userId: string, amount: string) {
  return getDb().transaction(async (tx) => {
    const [balance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBalances.userId, userId),
          sql`${userBalances.availableBalance} >= ${amount}`,
        ),
      )
      .returning();

    if (!balance) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, userId),
      });
      return {
        status: "insufficient_funds" as const,
        availableBalance: current?.availableBalance ?? "0",
      };
    }

    await tx.insert(custodialLedger).values({
      userId,
      eventType: "withdrawal",
      amount: `-${amount}`,
      balanceAfter: balance.availableBalance,
      reference: internalReference("withdrawal"),
    });

    return {
      status: "withdrawn" as const,
      availableBalance: balance.availableBalance,
      escrowedBalance: balance.escrowedBalance,
    };
  });
}

export async function unlockWithCustodialBalance({
  userId,
  postId,
  amount,
  settlementMs,
  onChainUnits,
}: {
  userId: string;
  postId: string;
  amount: string;
  settlementMs: number;
  /**
   * The wallet's current USDC, in atomic units. Passed in because the check must
   * happen under the balance-row lock, and reading the chain inside a DB
   * transaction is not something to do. See lib/spend-reservation.
   */
  onChainUnits: bigint;
}): Promise<CustodialUnlockResult> {
  return getDb().transaction(async (tx) => {
    if (persistUnlockOwnership()) {
      const existing = await tx.query.unlocks.findFirst({
        where: and(eq(unlocks.fanId, userId), eq(unlocks.postId, postId)),
      });
      if (existing) {
        return {
          status: "already_unlocked",
          txHash: existing.paymentTxHash,
        };
      }
    } else {
      await tx
        .delete(unlocks)
        .where(and(eq(unlocks.fanId, userId), eq(unlocks.postId, postId)));
    }

    // Authorise the spend under the balance-row lock. The route's pre-check is an
    // unlocked read and cannot be trusted alone: a concurrent withdrawal read the
    // same balance and both proceeded, letting a fan keep the media AND the money.
    const reserved = await checkAndEscrow(tx, userId, amount, onChainUnits);
    if (!reserved.ok) {
      return {
        status: "insufficient_funds",
        balance: reserved.spendable,
        required: amount,
      };
    }

    const [balance] = await tx
      .update(userBalances)
      .set({
        // The ledger mirror. `escrowedBalance` was already incremented by the
        // reservation above — don't add it twice.
        availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, userId))
      .returning();

    if (!balance) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, userId),
      });
      return {
        status: "insufficient_funds",
        balance: current?.availableBalance ?? "0",
        required: amount,
      };
    }

    const txHash = internalTxHash();

    await tx.insert(custodialLedger).values({
      userId,
      eventType: "unlock_debit",
      amount: `-${amount}`,
      balanceAfter: balance.availableBalance,
      postId,
      reference: txHash,
    });

    const [unlock] = await tx
      .insert(unlocks)
      .values({
        fanId: userId,
        postId,
        paymentTxHash: txHash,
        amountPaid: amount,
        settlementMs,
      })
      .returning();

    await tx.insert(loyaltyLedger).values({
      userId,
      amount: String(POINTS_PER_UNLOCK),
      eventType: "post_unlock",
      referenceId: unlock.id,
      txHash,
    });

    return {
      status: "unlocked",
      txHash,
      balance: balance.availableBalance,
    };
  });
}

export async function rollbackCustodialUnlock({
  userId,
  postId,
  amount,
  txHash,
}: {
  userId: string;
  postId: string;
  amount: string;
  txHash: string;
}) {
  return getDb().transaction(async (tx) => {
    const unlock = await tx.query.unlocks.findFirst({
      where: and(
        eq(unlocks.fanId, userId),
        eq(unlocks.postId, postId),
        eq(unlocks.paymentTxHash, txHash),
      ),
    });
    if (!unlock) return null;

    await tx
      .delete(loyaltyLedger)
      .where(eq(loyaltyLedger.referenceId, unlock.id));
    await tx.delete(unlocks).where(eq(unlocks.id, unlock.id));
    await tx
      .delete(custodialLedger)
      .where(eq(custodialLedger.reference, txHash));

    const [balance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
        escrowedBalance: sql`${userBalances.escrowedBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, userId))
      .returning();

    return balance;
  });
}

export async function finalizeCustodialUnlockPaymentHash({
  userId,
  postId,
  internalTxHash,
  paymentTxHash,
}: {
  userId: string;
  postId: string;
  internalTxHash: string;
  paymentTxHash: string;
}) {
  await getDb().transaction(async (tx) => {
    const [unlock] = await tx
      .update(unlocks)
      .set({ paymentTxHash })
      .where(
        and(
          eq(unlocks.fanId, userId),
          eq(unlocks.postId, postId),
          eq(unlocks.paymentTxHash, internalTxHash),
        ),
      )
      .returning();

    if (!unlock) return;

    await tx
      .update(userBalances)
      .set({
        escrowedBalance: sql`${userBalances.escrowedBalance} - ${unlock.amountPaid}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBalances.userId, userId),
          sql`${userBalances.escrowedBalance} >= ${unlock.amountPaid}`,
        ),
      );

    await tx
      .update(loyaltyLedger)
      .set({ txHash: paymentTxHash })
      .where(eq(loyaltyLedger.referenceId, unlock.id));
  });
}

// ── Tips (fan → creator) ──────────────────────────────────────────────────────
// A tip is an internal custodial-balance transfer: the fan is debited and the
// creator credited the full amount, atomically, in one transaction. Mirrors the
// unlock ledger pattern but the counterparty is another user's balance rather
// than the platform wallet.

export type CustodialTipResult =
  | { status: "sent"; txHash: string; balance: string }
  | { status: "insufficient_funds"; balance: string; required: string }
  | { status: "self_tip" };

export async function tipWithCustodialBalance({
  fanId,
  creatorId,
  postId,
  amount,
  message,
  settlementMs,
  paymentTxHash,
}: {
  fanId: string;
  creatorId: string;
  postId?: string | null;
  amount: string;
  message?: string | null;
  settlementMs: number;
  /** Real on-chain settlement hash; falls back to an internal ref for the row. */
  paymentTxHash?: string;
}): Promise<CustodialTipResult> {
  if (fanId === creatorId) return { status: "self_tip" };

  return getDb().transaction(async (tx) => {
    await tx.insert(userBalances).values({ userId: fanId }).onConflictDoNothing();

    // Debit the fan, guarded so a concurrent spend can't overdraw the balance.
    const [fanBalance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      // On-chain is the spend authority now (the route pre-checks the wallet
      // and the settlement transfer is the real guard). The ledger just mirrors.
      .where(eq(userBalances.userId, fanId))
      .returning();

    if (!fanBalance) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "insufficient_funds",
        balance: current?.availableBalance ?? "0",
        required: amount,
      };
    }

    const txHash = internalTxHash();

    await tx.insert(custodialLedger).values({
      userId: fanId,
      eventType: "tip_debit",
      amount: `-${amount}`,
      balanceAfter: fanBalance.availableBalance,
      postId: postId ?? null,
      reference: txHash,
    });

    // Credit the creator the full amount.
    await tx
      .insert(userBalances)
      .values({ userId: creatorId })
      .onConflictDoNothing();
    const [creatorBalance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, creatorId))
      .returning();

    await tx.insert(custodialLedger).values({
      userId: creatorId,
      eventType: "tip_credit",
      amount,
      balanceAfter: creatorBalance.availableBalance,
      postId: postId ?? null,
      reference: `${txHash}:credit`,
    });

    const [tip] = await tx
      .insert(tips)
      .values({
        fanId,
        creatorId,
        postId: postId ?? null,
        amount,
        message: message ?? null,
        paymentTxHash: paymentTxHash ?? txHash,
        settlementMs,
      })
      .returning();

    // The fan earns loyalty points for the gesture, like any spend.
    await tx.insert(loyaltyLedger).values({
      userId: fanId,
      amount: String(POINTS_PER_UNLOCK),
      eventType: "tip",
      referenceId: tip.id,
      txHash,
    });

    return {
      status: "sent",
      txHash: paymentTxHash ?? txHash,
      balance: fanBalance.availableBalance,
    };
  });
}

export type MppCallReserveResult =
  | {
      status: "reserved";
      txHash: string;
      balance: string;
      escrowedBalance: string;
      amount: string;
      chargedSeconds: number;
    }
  | {
      status: "already_reserved";
      txHash: string;
      balance: string;
      escrowedBalance: string;
      amount: string;
      chargedSeconds: number;
    }
  | { status: "insufficient_funds"; balance: string; required: string }
  | { status: "self_call" };

export type MppCallSettleResult =
  | {
      status: "settled" | "already_settled";
      txHash: string;
      balance: string;
      escrowedBalance: string;
      amount: string;
    }
  | { status: "nothing_to_settle"; balance: string; escrowedBalance: string }
  | { status: "self_call" };

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function getReservedMppCallAmount(
  tx: DbTransaction,
  fanId: string,
  threadId: string,
  callId: string,
) {
  const reserveLike = mppCallReserveReferenceLike(threadId, callId);
  const [reserved] = await tx
    .select({
      amount: sql<string>`COALESCE(SUM((-1) * ${custodialLedger.amount}), 0)`,
    })
    .from(custodialLedger)
    .where(
      and(
        eq(custodialLedger.userId, fanId),
        eq(custodialLedger.eventType, "mpp_call_debit"),
        sql`${custodialLedger.reference} LIKE ${reserveLike}`,
      ),
    );
  return reserved?.amount ?? "0";
}

export async function getMppCallEscrowAmount({
  fanId,
  threadId,
  callId,
}: {
  fanId: string;
  threadId: string;
  callId: string;
}) {
  return getDb().transaction((tx) =>
    getReservedMppCallAmount(tx, fanId, threadId, callId),
  );
}

export async function getMppCallEscrowStatus({
  fanId,
  creatorId,
  threadId,
  callId,
}: {
  fanId: string;
  creatorId: string;
  threadId: string;
  callId: string;
}) {
  const settleRef = mppCallSettleReference(threadId, callId);
  const settledLike = `${settleRef}|%`;

  return getDb().transaction(async (tx) => {
    const existingSettlement = await tx.query.custodialLedger.findFirst({
      where: and(
        eq(custodialLedger.userId, creatorId),
        eq(custodialLedger.eventType, "mpp_call_credit"),
        sql`${custodialLedger.reference} LIKE ${settledLike}`,
      ),
    });
    if (existingSettlement) {
      const [, txHash = ""] = existingSettlement.reference.split("|");
      const balance = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "settled" as const,
        amount: existingSettlement.amount,
        txHash,
        balance: balance?.availableBalance ?? "0",
        escrowedBalance: balance?.escrowedBalance ?? "0",
      };
    }

    return {
      status: "reserved" as const,
      amount: await getReservedMppCallAmount(tx, fanId, threadId, callId),
    };
  });
}

export async function reserveMppCallEscrow({
  fanId,
  creatorId,
  threadId,
  callId,
  amount,
  chargedSeconds,
  tick,
  onChainUnits,
}: {
  fanId: string;
  creatorId: string;
  threadId: string;
  callId: string;
  amount: string;
  chargedSeconds: number;
  tick: number;
  /** See unlockWithCustodialBalance — authorised under the balance-row lock. */
  onChainUnits: bigint;
}): Promise<MppCallReserveResult> {
  if (fanId === creatorId) return { status: "self_call" };
  const reference = mppCallReserveReference(threadId, callId, tick);

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reference}))`);

    const existing = await tx.query.custodialLedger.findFirst({
      where: and(eq(custodialLedger.userId, fanId), eq(custodialLedger.reference, reference)),
    });
    if (existing) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "already_reserved",
        txHash: reference,
        balance: existing.balanceAfter,
        escrowedBalance: current?.escrowedBalance ?? "0",
        amount,
        chargedSeconds,
      };
    }

    // The advisory lock above is keyed on the RESERVE REFERENCE — it makes a
    // repeated reserve of the same tick idempotent, but it never touches the
    // balance row, so it cannot serialize against a concurrent withdrawal. This
    // does: the same authorisation every other spend uses, under that row's lock.
    const reserved = await checkAndEscrow(tx, fanId, amount, onChainUnits);
    if (!reserved.ok) {
      return {
        status: "insufficient_funds",
        balance: reserved.spendable,
        required: amount,
      };
    }

    const [fanBalance] = await tx
      .update(userBalances)
      .set({
        // Ledger mirror; escrow was already incremented by the reservation.
        availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, fanId))
      .returning();

    if (!fanBalance) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "insufficient_funds",
        balance: current?.availableBalance ?? "0",
        required: amount,
      };
    }

    await tx.insert(custodialLedger).values({
      userId: fanId,
      eventType: "mpp_call_debit",
      amount: `-${amount}`,
      balanceAfter: fanBalance.availableBalance,
      reference,
    });

    return {
      status: "reserved",
      txHash: reference,
      // The fan's SPENDABLE money, not the ledger mirror.
      //
      // `availableBalance` is an audit trail: a fan is only ever debited (their
      // funds arrive as on-chain deposits, which never credit the ledger), so it
      // drifts permanently negative — a live reserve reported balance
      // "-10.05000000" while the wallet held $9. The 402 path already reports
      // the on-chain figure via checkOnChainSpendable, so returning the mirror
      // on success made a payments API contradict itself between 200 and 402.
      // on-chain minus escrow is what the next spend can actually use.
      balance: unitsToUsd(onChainUnits - usdToUnits(fanBalance.escrowedBalance)),
      escrowedBalance: fanBalance.escrowedBalance,
      amount,
      chargedSeconds,
    };
  });
}

export async function settleMppCallEscrow({
  fanId,
  creatorId,
  threadId,
  callId,
  paymentTxHash,
}: {
  fanId: string;
  creatorId: string;
  threadId: string;
  callId: string;
  paymentTxHash: string;
}): Promise<MppCallSettleResult> {
  if (fanId === creatorId) return { status: "self_call" };
  const settleRef = mppCallSettleReference(threadId, callId);
  const settledLike = `${settleRef}|%`;

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${settleRef}))`);

    const existingSettlement = await tx.query.custodialLedger.findFirst({
      where: and(
        eq(custodialLedger.userId, creatorId),
        eq(custodialLedger.eventType, "mpp_call_credit"),
        sql`${custodialLedger.reference} LIKE ${settledLike}`,
      ),
    });
    if (existingSettlement) {
      const [, existingTxHash = paymentTxHash] = existingSettlement.reference.split("|");
      const balance = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "already_settled",
        txHash: existingTxHash,
        balance: balance?.availableBalance ?? "0",
        escrowedBalance: balance?.escrowedBalance ?? "0",
        amount: existingSettlement.amount,
      };
    }

    const amount = await getReservedMppCallAmount(tx, fanId, threadId, callId);
    if (Number(amount) <= 0) {
      const balance = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, fanId),
      });
      return {
        status: "nothing_to_settle",
        balance: balance?.availableBalance ?? "0",
        escrowedBalance: balance?.escrowedBalance ?? "0",
      };
    }

    const [balance] = await tx
      .update(userBalances)
      .set({
        escrowedBalance: sql`${userBalances.escrowedBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBalances.userId, fanId),
          sql`${userBalances.escrowedBalance} >= ${amount}`,
        ),
      )
      .returning();

    await tx.insert(userBalances).values({ userId: creatorId }).onConflictDoNothing();
    const [creatorBalance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, creatorId))
      .returning();

    await tx.insert(custodialLedger).values({
      userId: creatorId,
      eventType: "mpp_call_credit",
      amount,
      balanceAfter: creatorBalance.availableBalance,
      reference: `${settleRef}|${paymentTxHash}`,
    });

    return {
      status: "settled",
      txHash: paymentTxHash,
      balance: balance?.availableBalance ?? "0",
      escrowedBalance: balance?.escrowedBalance ?? "0",
      amount,
    };
  });
}

export async function releaseMppCallEscrow({
  fanId,
  threadId,
  callId,
}: {
  fanId: string;
  threadId: string;
  callId: string;
}) {
  const settleRef = mppCallSettleReference(threadId, callId);
  const releaseRef = `${settleRef}:release`;
  return getDb().transaction(async (tx) => {
    // Lock on the SETTLE reference, not the release one.
    //
    // These used to take different keys — `settleRef` vs `settleRef:release` —
    // which hash to different locks, so a settle and a release of the SAME
    // reservation never serialized. They both read the reservation from the same
    // `mpp_call_debit` rows and both decrement the same escrow.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${settleRef}))`);

    // Refuse to release what was already settled.
    //
    // Settling does not delete the reserve rows — it only credits the creator —
    // so `getReservedMppCallAmount` still reported the full amount afterwards
    // and this refunded it a second time. No race needed; plain sequential
    // settle-then-release did it, and the route exposes both as client actions:
    //
    //     reserve $1 -> escrow  1
    //     settle     -> escrow  0   (creator credited $1)
    //     release    -> escrow -1   (fan refunded $1)
    //
    // A NEGATIVE escrow is phantom money: spendable is `on-chain − escrow`, so
    // −1 escrow hands the fan a dollar that does not exist, on top of refunding
    // a call the creator was already paid for.
    const settled = await tx.query.custodialLedger.findFirst({
      where: and(
        eq(custodialLedger.eventType, "mpp_call_credit"),
        sql`${custodialLedger.reference} LIKE ${`${settleRef}|%`}`,
      ),
    });
    if (settled) return null;

    const amount = await getReservedMppCallAmount(tx, fanId, threadId, callId);
    if (Number(amount) <= 0) return null;

    const reserveLike = mppCallReserveReferenceLike(threadId, callId);
    await tx
      .delete(custodialLedger)
      .where(
        and(
          eq(custodialLedger.userId, fanId),
          eq(custodialLedger.eventType, "mpp_call_debit"),
          sql`${custodialLedger.reference} LIKE ${reserveLike}`,
        ),
      );

    const [balance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
        // GREATEST(..., 0): belt and braces. The settled-check above is the real
        // guard, but escrow underpinning spendable must never go negative — that
        // is the difference between "refused" and "invented money".
        escrowedBalance: sql`GREATEST(${userBalances.escrowedBalance} - ${amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, fanId))
      .returning();

    await tx.insert(custodialLedger).values({
      userId: fanId,
      eventType: "refund",
      amount,
      balanceAfter: balance.availableBalance,
      reference: releaseRef,
    });

    return balance;
  });
}

// ── Per-region unlocks (partial posts) ───────────────────────────────────────
// Exact mirror of the post-unlock trio above, keyed on (fanId, postRegionId).
// Every region is charged the single `posts.unlockPrice`. The ledger row still
// carries the parent postId for creator-payout attribution.

export type CustodialRegionUnlockResult =
  | { status: "already_unlocked"; txHash?: string }
  | { status: "unlocked"; txHash: string; balance: string }
  | { status: "insufficient_funds"; balance: string; required: string };

export async function unlockRegionWithCustodialBalance({
  userId,
  postId,
  postRegionId,
  amount,
  settlementMs,
  onChainUnits,
}: {
  userId: string;
  postId: string;
  postRegionId: string;
  amount: string;
  settlementMs: number;
  /** See unlockWithCustodialBalance — authorised under the balance-row lock. */
  onChainUnits: bigint;
}): Promise<CustodialRegionUnlockResult> {
  return getDb().transaction(async (tx) => {
    if (persistUnlockOwnership()) {
      const existing = await tx.query.regionUnlocks.findFirst({
        where: and(
          eq(regionUnlocks.fanId, userId),
          eq(regionUnlocks.postRegionId, postRegionId),
        ),
      });
      if (existing) {
        return { status: "already_unlocked", txHash: existing.paymentTxHash };
      }
    } else {
      await tx
        .delete(regionUnlocks)
        .where(
          and(
            eq(regionUnlocks.fanId, userId),
            eq(regionUnlocks.postRegionId, postRegionId),
          ),
        );
    }

    // Same authorisation as a full unlock: under the balance-row lock, against
    // on-chain minus escrow. An unlocked pre-check races a concurrent withdrawal.
    const reserved = await checkAndEscrow(tx, userId, amount, onChainUnits);
    if (!reserved.ok) {
      return {
        status: "insufficient_funds",
        balance: reserved.spendable,
        required: amount,
      };
    }

    const [balance] = await tx
      .update(userBalances)
      .set({
        // Ledger mirror; escrow was already incremented by the reservation.
        availableBalance: sql`${userBalances.availableBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, userId))
      .returning();

    if (!balance) {
      const current = await tx.query.userBalances.findFirst({
        where: eq(userBalances.userId, userId),
      });
      return {
        status: "insufficient_funds",
        balance: current?.availableBalance ?? "0",
        required: amount,
      };
    }

    const txHash = internalTxHash();

    await tx.insert(custodialLedger).values({
      userId,
      eventType: "unlock_debit",
      amount: `-${amount}`,
      balanceAfter: balance.availableBalance,
      postId,
      reference: txHash,
    });

    const [unlock] = await tx
      .insert(regionUnlocks)
      .values({
        fanId: userId,
        postRegionId,
        paymentTxHash: txHash,
        amountPaid: amount,
        settlementMs,
      })
      .returning();

    await tx.insert(loyaltyLedger).values({
      userId,
      amount: String(POINTS_PER_UNLOCK),
      eventType: "post_unlock",
      referenceId: unlock.id,
      txHash,
    });

    return { status: "unlocked", txHash, balance: balance.availableBalance };
  });
}

export async function rollbackCustodialRegionUnlock({
  userId,
  postRegionId,
  amount,
  txHash,
}: {
  userId: string;
  postRegionId: string;
  amount: string;
  txHash: string;
}) {
  return getDb().transaction(async (tx) => {
    const unlock = await tx.query.regionUnlocks.findFirst({
      where: and(
        eq(regionUnlocks.fanId, userId),
        eq(regionUnlocks.postRegionId, postRegionId),
        eq(regionUnlocks.paymentTxHash, txHash),
      ),
    });
    if (!unlock) return null;

    await tx.delete(loyaltyLedger).where(eq(loyaltyLedger.referenceId, unlock.id));
    await tx.delete(regionUnlocks).where(eq(regionUnlocks.id, unlock.id));
    await tx.delete(custodialLedger).where(eq(custodialLedger.reference, txHash));

    const [balance] = await tx
      .update(userBalances)
      .set({
        availableBalance: sql`${userBalances.availableBalance} + ${amount}`,
        escrowedBalance: sql`${userBalances.escrowedBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userBalances.userId, userId))
      .returning();

    return balance;
  });
}

export async function finalizeCustodialRegionUnlockPaymentHash({
  userId,
  postRegionId,
  internalTxHash: internalHash,
  paymentTxHash,
}: {
  userId: string;
  postRegionId: string;
  internalTxHash: string;
  paymentTxHash: string;
}) {
  await getDb().transaction(async (tx) => {
    const [unlock] = await tx
      .update(regionUnlocks)
      .set({ paymentTxHash })
      .where(
        and(
          eq(regionUnlocks.fanId, userId),
          eq(regionUnlocks.postRegionId, postRegionId),
          eq(regionUnlocks.paymentTxHash, internalHash),
        ),
      )
      .returning();

    if (!unlock) return;

    await tx
      .update(userBalances)
      .set({
        escrowedBalance: sql`${userBalances.escrowedBalance} - ${unlock.amountPaid}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBalances.userId, userId),
          sql`${userBalances.escrowedBalance} >= ${unlock.amountPaid}`,
        ),
      );

    await tx
      .update(loyaltyLedger)
      .set({ txHash: paymentTxHash })
      .where(eq(loyaltyLedger.referenceId, unlock.id));
  });
}
