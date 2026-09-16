/**
 * DEV ONLY — deterministic manual tracks for the current partial-video fixture.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/dev-track-unveil-fixture.ts
 *   dotenv -e .env.local -- tsx scripts/dev-track-unveil-fixture.ts --source /path/to/source.mp4
 *
 * The detector is intentionally bypassed for this fixture. The two hand-authored
 * tracks are sampled to 10 fps, turned into a binary mask video, composited over
 * the clean source, and persisted back to the existing dev post.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { and, asc, eq, notInArray } from "drizzle-orm";
import sharp from "sharp";
import { uploadPrivate, presignPrivateGet } from "@/lib/blob";
import { compositeVideoBlur, cropVideoRegion } from "@/lib/blur/composite-video";
import { fetchBuffer } from "@/lib/blur/composite";
import { probeVideo } from "@/lib/blur/frames";
import { getDb } from "@/lib/db";
import {
  posts,
  postRegions,
  type RegionRect,
  type RegionTrackPoint,
} from "@/lib/db/schema";

const POST_ID = "42032a19-a7db-4ea0-b075-430fb3cb7460";
const STORAGE_PREFIX = `blur-jobs/manual-${POST_ID}`;
const BLURRED_KEY = `${STORAGE_PREFIX}/blurred.mp4`;
const SAMPLE_FPS = 10;
const CROP_PAD = 0.08;
const MASK_SOLID_STOP = 0.76;
const MASK_FADE_STOP = 1;
const MASK_FEATHER_SIGMA = 28;

type RegionLabel = "breast" | "penetration";
type Keyframe = { t: number; rect: RegionRect };
type ManualRegion = { label: RegionLabel; keyframes: Keyframe[] };

const MANUAL_REGIONS: ManualRegion[] = [
  {
    label: "breast",
    keyframes: [
      { t: 0, rect: { x: 0.335, y: 0, w: 0.265, h: 0.405 } },
      { t: 0.5, rect: { x: 0.338, y: 0, w: 0.266, h: 0.41 } },
      { t: 1, rect: { x: 0.346, y: 0, w: 0.26, h: 0.405 } },
      { t: 1.5, rect: { x: 0.342, y: 0, w: 0.262, h: 0.405 } },
      { t: 2, rect: { x: 0.338, y: 0, w: 0.266, h: 0.41 } },
      { t: 2.5, rect: { x: 0.338, y: 0, w: 0.268, h: 0.415 } },
      { t: 3, rect: { x: 0.338, y: 0, w: 0.268, h: 0.42 } },
      { t: 3.5, rect: { x: 0.336, y: 0, w: 0.268, h: 0.42 } },
      { t: 4.451, rect: { x: 0.338, y: 0, w: 0.268, h: 0.42 } },
    ],
  },
  {
    label: "penetration",
    keyframes: [
      { t: 0, rect: { x: 0.34, y: 0.42, w: 0.42, h: 0.7 } },
      { t: 0.5, rect: { x: 0.35, y: 0.435, w: 0.405, h: 0.685 } },
      { t: 1, rect: { x: 0.36, y: 0.45, w: 0.395, h: 0.67 } },
      { t: 1.5, rect: { x: 0.365, y: 0.46, w: 0.395, h: 0.66 } },
      { t: 2, rect: { x: 0.372, y: 0.46, w: 0.39, h: 0.66 } },
      { t: 2.5, rect: { x: 0.38, y: 0.465, w: 0.385, h: 0.655 } },
      { t: 3, rect: { x: 0.385, y: 0.465, w: 0.385, h: 0.655 } },
      { t: 3.5, rect: { x: 0.39, y: 0.465, w: 0.385, h: 0.655 } },
      { t: 4.451, rect: { x: 0.385, y: 0.465, w: 0.385, h: 0.655 } },
    ],
  },
];

function argValue(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function roundRect(rect: RegionRect): RegionRect {
  return {
    x: round(rect.x),
    y: round(rect.y),
    w: round(rect.w),
    h: round(rect.h),
  };
}

function round(n: number) {
  return Number(n.toFixed(6));
}

function clamp01(v: number, offset = 0) {
  return Math.max(0, Math.min(1 - offset, v));
}

function sampleKeyframes(keyframes: Keyframe[], t: number): RegionRect {
  if (t <= keyframes[0].t) return keyframes[0].rect;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.rect;

  let i = 1;
  while (i < keyframes.length && keyframes[i].t < t) i += 1;
  const a = keyframes[i - 1];
  const b = keyframes[i];
  const f = (t - a.t) / (b.t - a.t || 1);
  return roundRect({
    x: a.rect.x + (b.rect.x - a.rect.x) * f,
    y: a.rect.y + (b.rect.y - a.rect.y) * f,
    w: a.rect.w + (b.rect.w - a.rect.w) * f,
    h: a.rect.h + (b.rect.h - a.rect.h) * f,
  });
}

function buildTrack(region: ManualRegion, durationSec: number): RegionTrackPoint[] {
  const samples = Math.ceil(durationSec * SAMPLE_FPS) + 1;
  const track: RegionTrackPoint[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = Math.min(durationSec, i / SAMPLE_FPS);
    track.push({ t: round(t), rect: sampleKeyframes(region.keyframes, t) });
  }
  return track;
}

function unionTrack(track: RegionTrackPoint[], pad = 0): RegionRect {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const point of track) {
    x0 = Math.min(x0, point.rect.x);
    y0 = Math.min(y0, point.rect.y);
    x1 = Math.max(x1, point.rect.x + point.rect.w);
    y1 = Math.max(y1, point.rect.y + point.rect.h);
  }
  const x = clamp01(x0 - pad);
  const y = clamp01(y0 - pad);
  return roundRect({
    x,
    y,
    w: clamp01(x1 - x0 + pad * 2, x),
    h: clamp01(y1 - y0 + pad * 2, y),
  });
}

function toEvenPixelRect(rect: RegionRect, srcW: number, srcH: number) {
  const x = evenFloor(rect.x * srcW);
  const y = evenFloor(rect.y * srcH);
  const right = evenCeil((rect.x + rect.w) * srcW);
  const bottom = evenCeil((rect.y + rect.h) * srcH);
  return {
    x,
    y,
    w: Math.max(2, Math.min(srcW - x, right - x)),
    h: Math.max(2, Math.min(srcH - y, bottom - y)),
  };
}

function toNormalizedRect(
  rect: { x: number; y: number; w: number; h: number },
  srcW: number,
  srcH: number,
): RegionRect {
  return roundRect({
    x: rect.x / srcW,
    y: rect.y / srcH,
    w: rect.w / srcW,
    h: rect.h / srcH,
  });
}

function evenFloor(n: number) {
  return Math.max(0, Math.floor(n / 2) * 2);
}

function evenCeil(n: number) {
  return Math.ceil(n / 2) * 2;
}

async function renderMaskFrames({
  dir,
  width,
  height,
  tracks,
}: {
  dir: string;
  width: number;
  height: number;
  tracks: RegionTrackPoint[][];
}) {
  const frames = Math.max(...tracks.map((track) => track.length));
  for (let i = 0; i < frames; i += 1) {
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>`;
    for (let t = 0; t < tracks.length; t += 1) {
      svg += `<radialGradient id="soft-${t}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="white" stop-opacity="1"/><stop offset="${MASK_SOLID_STOP * 100}%" stop-color="white" stop-opacity="1"/><stop offset="${MASK_FADE_STOP * 100}%" stop-color="white" stop-opacity="0"/></radialGradient>`;
    }
    svg += "</defs>";
    for (let t = 0; t < tracks.length; t += 1) {
      const track = tracks[t];
      const rect = track[Math.min(i, track.length - 1)].rect;
      svg += `<ellipse cx="${(rect.x + rect.w / 2) * width}" cy="${(rect.y + rect.h / 2) * height}" rx="${(rect.w * width) / 2}" ry="${(rect.h * height) / 2}" fill="url(#soft-${t})"/>`;
    }
    svg += "</svg>";
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "black",
      },
    })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toFile(join(dir, `mask-${String(i + 1).padStart(4, "0")}.png`));
  }
}

function encodeMaskVideo(frameDir: string, outPath: string, durationSec: number) {
  execFileSync(
    ffmpegInstaller.path,
    [
      "-y",
      "-framerate",
      String(SAMPLE_FPS),
      "-i",
      join(frameDir, "mask-%04d.png"),
      "-t",
      String(durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { stdio: "inherit" },
  );
}

async function sourcePathFor(post: typeof posts.$inferSelect, workDir: string) {
  const sourceArg = argValue("--source");
  if (sourceArg) {
    const source = resolve(sourceArg);
    if (!existsSync(source)) throw new Error(`source does not exist: ${source}`);
    return source;
  }

  const sourcePath = join(workDir, "source.mp4");
  const sourceUrl = await presignPrivateGet(post.privateMediaKey, 300);
  writeFileSync(sourcePath, await fetchBuffer(sourceUrl));
  return sourcePath;
}

async function main() {
  const db = getDb();
  const post = await db.query.posts.findFirst({ where: eq(posts.id, POST_ID) });
  if (!post) throw new Error(`post not found: ${POST_ID}`);
  if (post.mediaType !== "video" || post.accessMode !== "partial") {
    throw new Error(`post ${POST_ID} is not a partial video fixture`);
  }

  const workDir = resolve(argValue("--work-dir") ?? `/tmp/veil-manual-track-${POST_ID}`);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const sourcePath = await sourcePathFor(post, workDir);
  const meta = await probeVideo(sourcePath);
  if (!meta.width || !meta.height || !meta.durationSec) {
    throw new Error("source video is missing width/height/duration metadata");
  }

  const tracksByLabel = new Map<RegionLabel, RegionTrackPoint[]>();
  const rectsByLabel = new Map<RegionLabel, RegionRect>();
  const pixelRectsByLabel = new Map<RegionLabel, { x: number; y: number; w: number; h: number }>();
  for (const region of MANUAL_REGIONS) {
    const track = buildTrack(region, meta.durationSec);
    const pixelRect = toEvenPixelRect(unionTrack(track, CROP_PAD), meta.width, meta.height);
    tracksByLabel.set(region.label, track);
    rectsByLabel.set(region.label, toNormalizedRect(pixelRect, meta.width, meta.height));
    pixelRectsByLabel.set(region.label, pixelRect);
  }

  const frameDir = join(workDir, "mask-frames");
  mkdirSync(frameDir, { recursive: true });
  await renderMaskFrames({
    dir: frameDir,
    width: meta.width,
    height: meta.height,
    tracks: MANUAL_REGIONS.map((region) => tracksByLabel.get(region.label)!),
  });

  const maskPath = join(workDir, "mask.mp4");
  const blurredPath = join(workDir, "blurred.mp4");
  encodeMaskVideo(frameDir, maskPath, meta.durationSec);
  await compositeVideoBlur(sourcePath, maskPath, blurredPath, {
    featherSigma: MASK_FEATHER_SIGMA,
  });

  await uploadPrivate(BLURRED_KEY, readFileSync(blurredPath), {
    contentType: "video/mp4",
    upsert: true,
  });

  const existing = await db.query.postRegions.findMany({
    where: eq(postRegions.postId, POST_ID),
    orderBy: [asc(postRegions.position)],
  });
  const rowsByLabel = new Map(existing.map((row) => [row.label, row]));
  for (const region of MANUAL_REGIONS) {
    if (!rowsByLabel.has(region.label)) {
      throw new Error(`expected existing region row for label ${region.label}`);
    }
  }

  const keepIds: string[] = [];
  for (let i = 0; i < MANUAL_REGIONS.length; i += 1) {
    const region = MANUAL_REGIONS[i];
    const row = rowsByLabel.get(region.label)!;
    const patchPath = join(workDir, `${region.label}.mp4`);
    const patchKey = `${STORAGE_PREFIX}/region-${i}.mp4`;
    await cropVideoRegion(sourcePath, patchPath, pixelRectsByLabel.get(region.label)!);
    await uploadPrivate(patchKey, readFileSync(patchPath), {
      contentType: "video/mp4",
      upsert: true,
    });
    await db
      .update(postRegions)
      .set({
        label: region.label,
        rect: rectsByLabel.get(region.label)!,
        track: tracksByLabel.get(region.label)!,
        patchMediaKey: patchKey,
        position: i,
      })
      .where(eq(postRegions.id, row.id));
    keepIds.push(row.id);
  }

  await db
    .delete(postRegions)
    .where(and(eq(postRegions.postId, POST_ID), notInArray(postRegions.id, keepIds)));

  await db
    .update(posts)
    .set({
      blurredPreviewUrl: BLURRED_KEY,
      privateMediaKey: post.privateMediaKey,
      durationMs: Math.round(meta.durationSec * 1000),
      accessMode: "partial",
      mediaType: "video",
      isPublished: true,
    })
    .where(eq(posts.id, POST_ID));

  console.log(
    JSON.stringify(
      {
        postId: POST_ID,
        workDir,
        sourcePath,
        maskPath,
        blurredKey: BLURRED_KEY,
        regions: MANUAL_REGIONS.map((region) => ({
          label: region.label,
          rect: rectsByLabel.get(region.label),
          trackPoints: tracksByLabel.get(region.label)?.length ?? 0,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
