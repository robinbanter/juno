import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { performerRecords } from "@/lib/db/schema";
import { recordsRequiredFor } from "./policy";

/**
 * §2257 record enforcement.
 *
 * 18 U.S.C. §2257 makes a producer of sexually explicit content keep records
 * proving every performer was an adult and consented. The enforcement point is
 * publishing: no verified record, no publish. A records system nobody is gated
 * on is decoration.
 *
 * `REQUIRE_2257_RECORDS` exists because local development and the test suite
 * cannot produce real ID documents — so it is OFF by default there.
 *
 * It is ON by default in PRODUCTION. Defaulting off everywhere made the unsafe
 * state the one you got by forgetting: a deploy that never ran
 * `mainnet:preflight` let creators publish sexually explicit media with no
 * age-or-consent record on file, silently. The default now has to be wrong on
 * purpose rather than by omission.
 *
 * An explicit `REQUIRE_2257_RECORDS=false` still overrides — a staging box may
 * need it — and preflight still blocks that for MainNet.
 */

export function recordsRequired(): boolean {
  // The decision lives in ./policy so `mainnet:preflight` evaluates the SAME
  // rule rather than a copy of it that can drift.
  return recordsRequiredFor(process.env.NODE_ENV, process.env.REQUIRE_2257_RECORDS);
}

export type RecordsCheck =
  | { ok: true }
  | { ok: false; reason: string; code: "no_record" | "pending" | "rejected" };

/**
 * May this creator publish?
 *
 * Only a `verified` record passes. `pending` deliberately does not: "someone
 * uploaded an ID we haven't looked at" is not proof of anything, and letting it
 * through would make the whole gate theatre.
 */
export async function checkPerformerRecords(creatorId: string): Promise<RecordsCheck> {
  if (!recordsRequired()) return { ok: true };

  const record = await getDb().query.performerRecords.findFirst({
    where: and(
      eq(performerRecords.creatorId, creatorId),
      eq(performerRecords.status, "verified"),
    ),
    columns: { id: true },
  });
  if (record) return { ok: true };

  // Distinguish "never submitted" from "submitted, waiting" — the creator can
  // act on the first and only wait on the second.
  const any = await getDb().query.performerRecords.findFirst({
    where: eq(performerRecords.creatorId, creatorId),
    columns: { status: true },
  });

  if (!any) {
    return {
      ok: false,
      code: "no_record",
      reason:
        "Age and consent records are required before publishing. Submit yours to continue.",
    };
  }
  if (any.status === "rejected") {
    return {
      ok: false,
      code: "rejected",
      reason: "Your age and consent records were rejected. Contact support to resubmit.",
    };
  }
  return {
    ok: false,
    code: "pending",
    reason: "Your age and consent records are being reviewed. You can publish once verified.",
  };
}
