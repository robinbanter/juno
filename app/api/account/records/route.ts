import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { getDb } from "@/lib/db";
import { performerRecords } from "@/lib/db/schema";
import { uploadPrivate } from "@/lib/blob";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ID_BYTES = 10 * 1024 * 1024;
const ID_TYPES = ["passport", "drivers_license", "national_id"] as const;

/** Records must outlive the content they cover; §2257 says 7 years is the floor. */
const RETENTION_YEARS = 7;

/**
 * Submit §2257 age/consent records.
 *
 * Publishing is gated on a VERIFIED record, so without this endpoint the gate is
 * a lockout: creators would be told records are required with no way to provide
 * them. Submitting creates a `pending` record — it does not unlock publishing.
 * An operator must verify it, because "someone uploaded a file" is not proof.
 *
 * The ID document goes to private storage and only its key is stored. This is
 * the most sensitive PII in the system: a government ID plus a legal name plus a
 * date of birth plus an adult-content account. Treat it accordingly.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const limited = rateLimit(`records:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  /**
   * Only what this route reads.
   *
   * Two incompatible `FormData` types are visible during the production build —
   * the ambient DOM one and the undici one `req.formData()` actually returns —
   * and annotating either way fails: the first rejects the assignment, the
   * second reports `get` as missing. `tsc --noEmit` sees only one of them and
   * passes, which is why this only surfaced at build time.
   *
   * A structural type describing the single method used sidesteps the clash
   * without asserting anything untrue about the value.
   */
  let form: { get(name: string): unknown };
  try {
    form = (await req.formData()) as unknown as typeof form;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const legalName = (form.get("legalName") as string | null)?.trim() ?? "";
  const stageNames = (form.get("stageNames") as string | null)?.trim() || null;
  const dob = (form.get("dateOfBirth") as string | null)?.trim() ?? "";
  const idType = (form.get("idDocumentType") as string | null)?.trim() ?? "";
  const idDoc = form.get("idDocument");
  const consented = form.get("consent") === "true";

  if (!legalName) {
    return NextResponse.json({ error: "Legal name is required" }, { status: 400 });
  }
  if (!ID_TYPES.includes(idType as (typeof ID_TYPES)[number])) {
    return NextResponse.json(
      { error: `idDocumentType must be one of: ${ID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!consented) {
    return NextResponse.json(
      { error: "You must confirm consent to appear in this content" },
      { status: 400 },
    );
  }

  const birth = new Date(dob);
  if (!dob || Number.isNaN(birth.getTime())) {
    return NextResponse.json({ error: "A valid date of birth is required" }, { status: 400 });
  }
  // Reject an underage claim outright. Verification still happens against the ID,
  // but nothing is gained by storing a record that states it is non-compliant.
  const eighteenthBirthday = new Date(birth);
  eighteenthBirthday.setFullYear(birth.getFullYear() + 18);
  if (eighteenthBirthday > new Date()) {
    return NextResponse.json(
      { error: "You must be at least 18 years old." },
      { status: 403 },
    );
  }

  if (!(idDoc instanceof File) || idDoc.size === 0) {
    return NextResponse.json({ error: "An ID document is required" }, { status: 400 });
  }
  if (idDoc.size > MAX_ID_BYTES) {
    return NextResponse.json({ error: "ID document too large (max 10 MB)" }, { status: 413 });
  }

  // Private storage, key only. Never a public URL — this is a government ID.
  let idDocumentKey: string;
  try {
    const ext = idDoc.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const blob = await uploadPrivate(
      `records/${user.id}/${randomUUID()}.${ext}`,
      Buffer.from(await idDoc.arrayBuffer()),
      { contentType: idDoc.type || "application/octet-stream" },
    );
    idDocumentKey = blob.pathname;
  } catch (err) {
    console.error("[records] ID upload failed:", err);
    return NextResponse.json({ error: "Could not store the document" }, { status: 502 });
  }

  const retainUntil = new Date();
  retainUntil.setFullYear(retainUntil.getFullYear() + RETENTION_YEARS);

  const [record] = await getDb()
    .insert(performerRecords)
    .values({
      creatorId: user.id,
      legalName,
      stageNames,
      dateOfBirth: birth,
      idDocumentKey,
      idDocumentType: idType,
      consentSignedAt: new Date(),
      status: "pending",
      retainUntil,
    })
    .returning({ id: performerRecords.id });

  return NextResponse.json(
    {
      recordId: record.id,
      status: "pending",
      message: "Submitted. You can publish once a reviewer verifies your records.",
    },
    { status: 201 },
  );
}

/** The creator's own record status — so the UI can say where they stand. */
export async function GET() {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const record = await getDb().query.performerRecords.findFirst({
    where: eq(performerRecords.creatorId, user.id),
    // Never return the document key or the DOB to the client — the creator
    // gains nothing from them and every extra copy is more exposure.
    columns: { id: true, status: true, createdAt: true, verifiedAt: true },
  });

  return NextResponse.json({ record: record ?? null });
}
