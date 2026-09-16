import {
  getReplicate,
  MODELS,
  createPredictionWithRetry,
  withReplicateCreateRetry,
} from "./replicate";
import { regionsToSam2Clicks } from "./geometry";
import type { DetectedRegion } from "@/lib/db/schema";

// Shared input for meta/sam-2-video. mask_type 'binary' → B&W masks suitable
// for ffmpeg alpha compositing; output_video true → ONE mask video (easier to
// composite than a frame sequence). output_video defaults to false, so we must
// set it. Verified against the live model schema (2026-06-18).
function sam2Input(videoUrl: string, regions: DetectedRegion[], fps: number) {
  return {
    input_video: videoUrl,
    ...regionsToSam2Clicks(regions),
    mask_type: "binary",
    output_video: true,
    video_fps: fps,
  };
}

/**
 * P1 PoC (synchronous): block until the mask video is ready, return its URL.
 * sam-2-video needs a pinned version hash (it is not an official model).
 */
export async function runTrackMasks(
  videoUrl: string,
  regions: DetectedRegion[],
  fps = 30,
): Promise<string> {
  const replicate = getReplicate();
  const out = await withReplicateCreateRetry(() =>
    replicate.run(MODELS.sam2Video.ref, {
      input: sam2Input(videoUrl, regions, fps),
    }),
  );
  return Array.isArray(out) ? String(out[0]) : String(out);
}

/**
 * P2 (async): start a prediction with a webhook; returns the prediction object.
 * The webhook receiver advances the job state machine when tracking completes.
 */
export async function startTrackMasks(
  videoUrl: string,
  regions: DetectedRegion[],
  webhookUrl: string,
  fps = 30,
) {
  return createPredictionWithRetry({
    version: process.env.REPLICATE_SAM2_VIDEO_VERSION!,
    input: sam2Input(videoUrl, regions, fps),
    webhook: webhookUrl,
    webhook_events_filter: ["completed"],
  });
}
