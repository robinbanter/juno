import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeVideo, extractKeyframes, type VideoMeta } from "./frames";
import { detectRegions } from "./detect";
import { runTrackMasks } from "./track";
import { compositeVideoBlur } from "./composite-video";
import { fetchBuffer, type BlurOptions } from "./composite";
import type { DetectedRegion } from "@/lib/db/schema";

// The pipeline must hand Replicate a fetchable URL for the keyframes and the
// source video. The uploader is injected so lib/blur stays decoupled from any
// specific object store; the caller wires up Supabase Storage presign + cleanup.
export type Uploader = (
  data: Buffer,
  name: string,
  contentType: string,
) => Promise<{ url: string; cleanup?: () => Promise<void> }>;

export type VideoResult =
  | { status: "manual_review"; reason: "no_region_detected"; meta: VideoMeta }
  | {
      status: "ready_for_review";
      outPath: string;
      regions: DetectedRegion[];
      maskVideoUrl: string;
      meta: VideoMeta;
    };

/**
 * P1 video pipeline (synchronous PoC): keyframe detect → box→point → track →
 * ffmpeg composite. Fail-closed: nothing reaches the output unless a region was
 * detected. Heavy ffmpeg work runs locally / in a Node script (Vercel function
 * limits make this the PoC path; P2 moves it async, P5 into a Cog).
 */
export async function processVideo(
  localVideoPath: string,
  outPath: string,
  upload: Uploader,
  opts: BlurOptions = {},
): Promise<VideoResult> {
  const work = mkdtempSync(join(tmpdir(), "veil-blur-"));
  try {
    const meta = await probeVideo(localVideoPath);

    // 1. Keyframes → detect. PoC: seed from the first keyframe that has a hit.
    const keyframes = await extractKeyframes(localVideoPath, work);
    const keyframeFps = Number(process.env.BLUR_KEYFRAME_FPS ?? 1);
    const step = Math.max(1, Math.round(meta.fps / keyframeFps));

    const regions: DetectedRegion[] = [];
    for (let i = 0; i < keyframes.length; i++) {
      const up = await upload(readFileSync(keyframes[i]), `kf-${i}.jpg`, "image/jpeg");
      try {
        regions.push(...(await detectRegions(up.url, i * step)));
      } finally {
        await up.cleanup?.();
      }
      if (regions.length) break;
    }

    // 2. Fail-closed: nothing detected → never publish.
    if (!regions.length) {
      return { status: "manual_review", reason: "no_region_detected", meta };
    }

    // 3. Upload source → track masks across the whole clip.
    const src = await upload(readFileSync(localVideoPath), "source.mp4", "video/mp4");
    let maskVideoUrl: string;
    try {
      maskVideoUrl = await runTrackMasks(src.url, regions, Math.round(meta.fps));
    } finally {
      await src.cleanup?.();
    }

    // 4. Download the mask track, composite the blur (audio preserved).
    const maskPath = join(work, "mask.mp4");
    writeFileSync(maskPath, await fetchBuffer(maskVideoUrl));
    await compositeVideoBlur(localVideoPath, maskPath, outPath, opts);

    return { status: "ready_for_review", outPath, regions, maskVideoUrl, meta };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
