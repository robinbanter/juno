import "server-only";

import { getJob, type BlurJob } from "./jobs";
import { isUuid } from "@/lib/db/ids";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";

/**
 * Resolve a blur job the caller is actually allowed to touch.
 *
 * Authentication is not authorization. These routes were made to require a
 * session, which stopped anonymous abuse — and left every signed-in user able to
 * act on every OTHER user's jobs by id: approve (publishing someone's
 * unreviewed private media, at a price you choose), reject, retry (spending the
 * platform's Replicate credit), or read their job state.
 *
 * Returned as a single helper so the check can't be forgotten on one of the four
 * routes — the same reason the uuid guard lives in the query layer.
 *
 * 404, not 403, for someone else's job: confirming "this id exists but isn't
 * yours" tells an attacker which ids are real.
 */
export type JobAccess =
  | { ok: true; job: BlurJob; userId: string }
  | { ok: false; response: Response };

export async function requireOwnedJob(id: string): Promise<JobAccess> {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, response: unauthorizedJson() };
    throw err;
  }

  // A malformed id can't name a job; don't let it reach Postgres and throw.
  if (!isUuid(id)) {
    return { ok: false, response: Response.json({ error: "Job not found" }, { status: 404 }) };
  }

  const job = await getJob(id);
  if (!job || job.creatorId !== user.id) {
    return { ok: false, response: Response.json({ error: "Job not found" }, { status: 404 }) };
  }

  return { ok: true, job, userId: user.id };
}
