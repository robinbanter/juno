import { NextRequest } from "next/server";
import { createJob } from "@/lib/blur/jobs";
import { kickOff } from "@/lib/blur/state";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

// Postgres + Supabase Storage signing + video keyframe extraction need Node.
export const runtime = "nodejs";
// Just enough to create the job and kick off the first stage — NOT to process.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Each job creates a paid Replicate prediction, so the caller must be a real
  // signed-in user — and the creator is taken from that session, never from the
  // body: a body-supplied creatorId would let any caller queue work as anyone.
  let creator;
  try {
    creator = await requireCurrentAppUser();

    const limited = rateLimit(`blur:${creator.id}`, LIMITS.blurIngest);
    if (limited) return limited;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const { rawBlobKey, mediaType, postId } = (await req.json()) as {
    rawBlobKey?: string;
    mediaType?: "image" | "video";
    postId?: string;
  };

  if (!rawBlobKey || (mediaType !== "image" && mediaType !== "video")) {
    return Response.json({ error: "Missing/invalid fields" }, { status: 400 });
  }

  // 1. Persist a job row (status: 'uploaded').
  const job = await createJob({ rawBlobKey, creatorId: creator.id, mediaType, postId });

  // 2. Kick off the pipeline (presign + create prediction + webhook); do NOT
  //    await completion. Replicate calls /api/blur/webhook as each stage finishes.
  try {
    await kickOff(job);
    return Response.json({ jobId: job.id, status: "detecting" });
  } catch (err) {
    // The create call failed transiently — leave the job `uploaded` with no
    // prediction id so the reconcile cron re-kicks it. Report it honestly
    // rather than claiming "detecting".
    console.error("blur pipeline trigger failed (will be reconciled):", err);
    return Response.json({ jobId: job.id, status: "uploaded" });
  }
}
