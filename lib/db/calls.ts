import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./index";
import { callSessions } from "./schema";

export type CallSession = typeof callSessions.$inferSelect;
export type CallSessionStatus = CallSession["status"];

const ACTIVE_CALL_STATUSES: CallSessionStatus[] = [
  "created",
  "connecting",
  "connected",
  "ending",
];

export class ActiveCallSessionError extends Error {
  constructor(public session: CallSession) {
    super("An active call already exists for this thread");
    this.name = "ActiveCallSessionError";
  }
}

function activeScopeLockKey(threadId: string, fanId: string) {
  return `call-session:active:${threadId}:${fanId}`;
}

function callLockKey(callId: string) {
  return `call-session:${callId}`;
}

function assertScopedSession(
  session: CallSession,
  input: { threadId: string; fanId: string; creatorId: string },
) {
  if (
    session.threadId !== input.threadId ||
    session.fanId !== input.fanId ||
    session.creatorId !== input.creatorId
  ) {
    throw new Error("Call session scope mismatch");
  }
}

export function isActiveCallStatus(status: CallSessionStatus) {
  return ACTIVE_CALL_STATUSES.includes(status);
}

export async function withCallSessionLock<T>(
  callId: string,
  fn: () => Promise<T>,
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${callLockKey(callId)}))`);
    return fn();
  });
}

export async function getCallSession(callId: string) {
  return getDb().query.callSessions.findFirst({
    where: eq(callSessions.id, callId),
  });
}

export async function getScopedCallSession({
  callId,
  threadId,
  fanId,
}: {
  callId: string;
  threadId: string;
  fanId: string;
}) {
  return getDb().query.callSessions.findFirst({
    where: and(
      eq(callSessions.id, callId),
      eq(callSessions.threadId, threadId),
      eq(callSessions.fanId, fanId),
    ),
  });
}

export async function getActiveCallSession({
  threadId,
  fanId,
}: {
  threadId: string;
  fanId: string;
}) {
  return getDb().query.callSessions.findFirst({
    where: and(
      eq(callSessions.threadId, threadId),
      eq(callSessions.fanId, fanId),
      inArray(callSessions.status, ACTIVE_CALL_STATUSES),
    ),
    orderBy: [desc(callSessions.createdAt)],
  });
}

export async function createCallSession(input: {
  callId: string;
  threadId: string;
  fanId: string;
  creatorId: string;
}) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${activeScopeLockKey(
        input.threadId,
        input.fanId,
      )}))`,
    );

    const active = await tx.query.callSessions.findFirst({
      where: and(
        eq(callSessions.threadId, input.threadId),
        eq(callSessions.fanId, input.fanId),
        inArray(callSessions.status, ACTIVE_CALL_STATUSES),
      ),
      orderBy: [desc(callSessions.createdAt)],
    });
    if (active && active.id !== input.callId) {
      throw new ActiveCallSessionError(active);
    }

    const [created] = await tx
      .insert(callSessions)
      .values({
        id: input.callId,
        threadId: input.threadId,
        fanId: input.fanId,
        creatorId: input.creatorId,
        status: "connecting",
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    const existing = await tx.query.callSessions.findFirst({
      where: eq(callSessions.id, input.callId),
    });
    if (!existing) throw new Error("Call session could not be created");
    assertScopedSession(existing, input);
    return existing;
  });
}

export async function connectCallSession(input: {
  callId: string;
  threadId: string;
  fanId: string;
  creatorId: string;
  elevenConversationId?: string | null;
}) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${callLockKey(input.callId)}))`);

    const session = await tx.query.callSessions.findFirst({
      where: eq(callSessions.id, input.callId),
    });
    if (!session) throw new Error("Call session not found");
    assertScopedSession(session, input);
    if (["settled", "released", "failed"].includes(session.status)) return session;
    if (session.connectedAt) return session;

    const [updated] = await tx
      .update(callSessions)
      .set({
        status: "connected",
        connectedAt: new Date(),
        elevenConversationId:
          input.elevenConversationId ?? session.elevenConversationId,
        updatedAt: new Date(),
      })
      .where(eq(callSessions.id, input.callId))
      .returning();
    return updated;
  });
}

export async function updateCallSessionReservedSecond(
  callId: string,
  lastReservedSecond: number,
) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({ lastReservedSecond, updatedAt: new Date() })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}

export async function markCallSessionEnding({
  callId,
  endedAt,
}: {
  callId: string;
  endedAt: Date;
}) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({ status: "ending", endedAt, updatedAt: new Date() })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}

export async function recordCallSessionSettlementTx({
  callId,
  settlementTxHash,
}: {
  callId: string;
  settlementTxHash: string;
}) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({ settlementTxHash, updatedAt: new Date() })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}

export async function markCallSessionSettled({
  callId,
  settledSeconds,
  settledAmount,
  settlementTxHash,
  endedAt,
}: {
  callId: string;
  settledSeconds: number;
  settledAmount: string;
  settlementTxHash: string;
  endedAt: Date;
}) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({
      status: "settled",
      endedAt,
      settledSeconds,
      settledAmount,
      settlementTxHash,
      updatedAt: new Date(),
    })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}

export async function markCallSessionReleased({
  callId,
  endedAt,
  reason,
}: {
  callId: string;
  endedAt: Date;
  reason?: string;
}) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({
      status: "released",
      endedAt,
      failureReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}

export async function markCallSessionFailed({
  callId,
  endedAt,
  reason,
}: {
  callId: string;
  endedAt: Date;
  reason: string;
}) {
  const [updated] = await getDb()
    .update(callSessions)
    .set({
      status: "failed",
      endedAt,
      failureReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(callSessions.id, callId))
    .returning();
  return updated;
}
