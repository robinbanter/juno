import { getReplicate, MODELS, DESIRED_REGIONS } from "./replicate";
import type { DetectedRegion } from "@/lib/db/schema";

// grounding-dino output shape (verified live 2026-06-18):
//   { detections: [{ bbox: [x1,y1,x2,y2], label, confidence }], result_image? }
type GroundingDinoOutput = {
  detections?: Array<{ bbox: number[]; label: string; confidence: number }>;
  result_image?: string;
};

/**
 * Run grounding-dino on a single extracted keyframe → bounding boxes.
 * `frameIndex` is the source-video frame number this keyframe corresponds to,
 * so the resulting click can be seeded at the right point in time for SAM2.
 */
export async function detectRegions(
  frameUrl: string,
  frameIndex = 0,
): Promise<DetectedRegion[]> {
  const replicate = getReplicate();
  const out = (await replicate.run(MODELS.groundingDino.ref, {
    input: {
      image: frameUrl,
      query: DESIRED_REGIONS.join(","),
      box_threshold: Number(process.env.BLUR_BOX_THRESHOLD ?? 0.3),
      text_threshold: 0.25,
      show_visualisation: false, // skip the annotated render — we only need boxes
    },
  })) as GroundingDinoOutput;

  return (out.detections ?? []).map((d) => ({
    label: d.label,
    box: d.bbox as [number, number, number, number],
    confidence: d.confidence,
    frame: frameIndex,
  }));
}
