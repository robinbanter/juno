import { NextRequest } from "next/server";
import { verifyReplicateWebhook } from "@/lib/blur/webhook";
import { advance } from "@/lib/blur/state";
import { claimWebhookEvent, logCost } from "@/lib/blur/jobs";

export const runtime = "nodejs";
// Image composite is fast; video composite can be slow (moves to a worker in P4/P5).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const raw = await req.text(); // raw body REQUIRED for signature verification

  // 1. Verify the signature BEFORE trusting anything (PRD §12.5).
  let event;
  try {
    event = verifyReplicateWebhook(raw, {
      "webhook-id": req.headers.get("webhook-id"),
      "webhook-timestamp": req.headers.get("webhook-timestamp"),
      "webhook-signature": req.headers.get("webhook-signature"),
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("job");
  const stage = searchParams.get("stage");
  if (!jobId || !stage) {
    return Response.json({ error: "missing job/stage" }, { status: 400 });
  }

  // 2. Idempotency — claim the event id atomically; a retry/duplicate is skipped.
  if (!(await claimWebhookEvent(event.id, jobId))) {
    return Response.json({ ok: true, deduped: true });
  }

  // 3. Cost/observability — record Replicate's reported predict_time per stage.
  await logCost({
    jobId,
    stage,
    predictTime: event.metrics?.predict_time,
    status: event.status,
  });

  // 4. Advance the state machine.
  if (event.status === "failed" || event.status === "canceled") {
    await advance(jobId, stage, { error: event.error ?? "prediction failed" });
  } else if (event.status === "succeeded") {
    await advance(jobId, stage, { output: event.output });
  }

  return Response.json({ ok: true });
}
