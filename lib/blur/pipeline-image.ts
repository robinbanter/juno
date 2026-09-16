import {
  getReplicate,
  MODELS,
  DESIRED_REGIONS,
  NEGATIVE_REGIONS,
  GROUNDED_SAM_OUTPUT,
} from "./replicate";
import { compositeImageBlur, maskCoverage } from "./composite";

export type ImageResult =
  | {
      status: "manual_review";
      reason: "no_region_detected" | "api_no_output";
      coverage: number;
      outputs: string[];
    }
  | {
      status: "ready_for_review";
      blurredBuffer: Buffer;
      maskUrl: string;
      coverage: number;
      outputs: string[];
    };

/**
 * P0 image pipeline: detect + mask in one grounded_sam call, then composite a
 * heavy blur inside the masked region. Synchronous (images are fast).
 *
 * Fail-closed: if nothing meaningful is detected (near-empty mask), we DON'T
 * publish — we route to manual review. Nothing reaches the public until a
 * creator approves (PRD §11).
 */
export async function processImage(rawImageUrl: string): Promise<ImageResult> {
  const replicate = getReplicate();

  // adjustment_factor > 0 DILATES the mask (anti-leakage at region edges).
  const output = (await replicate.run(MODELS.groundedSam.ref, {
    input: {
      image: rawImageUrl,
      mask_prompt: DESIRED_REGIONS.join(","),
      negative_mask_prompt: NEGATIVE_REGIONS.join(","),
      adjustment_factor: Number(process.env.BLUR_MASK_DILATION ?? 12),
    },
  })) as unknown;

  const outputs = Array.isArray(output) ? output.map(String) : [];
  const maskUrl = outputs[GROUNDED_SAM_OUTPUT.mask];

  if (!maskUrl) {
    // API returned no mask file at all — treat as a failed detection.
    return { status: "manual_review", reason: "api_no_output", coverage: 0, outputs };
  }

  // grounded_sam always returns a mask; an all-black mask means "found nothing".
  const coverage = await maskCoverage(maskUrl);
  const minCoverage = Number(process.env.BLUR_MIN_COVERAGE ?? 0.001); // 0.1% of px
  if (coverage < minCoverage) {
    return { status: "manual_review", reason: "no_region_detected", coverage, outputs };
  }

  const blurredBuffer = await compositeImageBlur(rawImageUrl, maskUrl);
  return { status: "ready_for_review", blurredBuffer, maskUrl, coverage, outputs };
}
