import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { performerRecords, users } from "@/lib/db/schema";
import { requireModerator, moderationForbidden } from "@/lib/moderation-auth";
import { presignPrivateGet } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §2257 record review.
 *
 * Operator-only, and the ID document is presigned for 5 minutes rather than
 * served: a reviewer needs to see it once to check the DOB against the face and
 * the name, and a long-lived URL to a government ID is a liability with no
 * upside.
 */
export async function GET(req: NextRequest) {
  if (!(await requireModerator(req))) return moderationForbidden();

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const rows = await getDb()
    .select({
      id: performerRecords.id,
      legalName: performerRecords.legalName,
      stageNames: performerRecords.stageNames,
      dateOfBirth: performerRecords.dateOfBirth,
      idDocumentType: performerRecords.idDocumentType,
      idDocumentKey: performerRecords.idDocumentKey,
      status: performerRecords.status,
      consentSignedAt: performerRecords.consentSignedAt,
      createdAt: performerRecords.createdAt,
      creatorUsername: users.username,
    })
    .from(performerRecords)
    .leftJoin(users, eq(performerRecords.creatorId, users.id))
    .where(
      eq(performerRecords.status, status as "pending" | "verified" | "rejected"),
    )
    .orderBy(asc(performerRecords.createdAt))
    .limit(50);

  const records = await Promise.all(
    rows.map(async ({ idDocumentKey, ...r }) => ({
      ...r,
      // Short-lived and generated per view, never stored.
      idDocumentUrl: await presignPrivateGet(idDocumentKey, 300).catch(() => null),
    })),
  );

  return NextResponse.json({ records });
}

/** Verify or reject a record. Only `verified` lets the creator publish. */
export async function PATCH(req: NextRequest) {
  if (!(await requireModerator(req))) return moderationForbidden();

  const body = (await req.json().catch(() => ({}))) as {
    recordId?: unknown;
    action?: unknown;
    note?: unknown;
  };
  const recordId = typeof body.recordId === "string" ? body.recordId : "";
  const action = body.action;

  if (!recordId || (action !== "verify" && action !== "reject")) {
    return NextResponse.json(
      { error: "recordId and action (verify|reject) are required" },
      { status: 400 },
    );
  }

  const [updated] = await getDb()
    .update(performerRecords)
    .set({
      status: action === "verify" ? "verified" : "rejected",
      verifiedAt: new Date(),
      verifierNote: typeof body.note === "string" ? body.note.slice(0, 2000) : null,
    })
    .where(eq(performerRecords.id, recordId))
    .returning({ id: performerRecords.id, status: performerRecords.status });

  if (!updated) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  console.error(`[moderation] §2257 record ${updated.id} -> ${updated.status}`);
  return NextResponse.json({ ok: true, status: updated.status });
}
