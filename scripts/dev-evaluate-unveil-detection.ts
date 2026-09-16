/**
 * DEV ONLY — compare the pinned detector against the current manual tracks for
 * the partial-video fixture.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/dev-evaluate-unveil-detection.ts
 *   dotenv -e .env.local -- tsx scripts/dev-evaluate-unveil-detection.ts --times 0,1,2,3.5
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { uploadPrivate, presignPrivateGet } from "@/lib/blob";
import { fetchBuffer } from "@/lib/blur/composite";
import { DESIRED_REGIONS, getReplicate, MODELS } from "@/lib/blur/replicate";
import { probeVideo } from "@/lib/blur/frames";
import { getDb } from "@/lib/db";
import { posts, postRegions, type RegionRect, type RegionTrackPoint } from "@/lib/db/schema";

const POST_ID = "42032a19-a7db-4ea0-b075-430fb3cb7460";

type Detection = { bbox: number[]; label: string; confidence: number };
type GroundingDinoOutput = { detections?: Detection[] };

function argValue(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function timesFromArgs() {
  return (argValue("--times") ?? "0,0.5,1,1.5,2,2.5,3,3.5,4")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v >= 0);
}

function round(n: number) {
  return Number(n.toFixed(4));
}

function sampleTrack(track: RegionTrackPoint[], t: number): RegionRect | null {
  if (track.length === 0) return null;
  if (t <= track[0].t) return track[0].rect;
  const last = track[track.length - 1];
  if (t >= last.t) return last.rect;
  let i = 1;
  while (i < track.length && track[i].t < t) i += 1;
  const a = track[i - 1];
  const b = track[i];
  const f = (t - a.t) / (b.t - a.t || 1);
  return {
    x: a.rect.x + (b.rect.x - a.rect.x) * f,
    y: a.rect.y + (b.rect.y - a.rect.y) * f,
    w: a.rect.w + (b.rect.w - a.rect.w) * f,
    h: a.rect.h + (b.rect.h - a.rect.h) * f,
  };
}

function rectToBox(rect: RegionRect, width: number, height: number) {
  return {
    x1: rect.x * width,
    y1: rect.y * height,
    x2: (rect.x + rect.w) * width,
    y2: (rect.y + rect.h) * height,
  };
}

function detectionToBox(detection: Detection, width: number, height: number) {
  const [x1, y1, x2, y2] = detection.bbox;
  if (Math.max(x1, y1, x2, y2) <= 1.5) {
    return { x1: x1 * width, y1: y1 * height, x2: x2 * width, y2: y2 * height };
  }
  return { x1, y1, x2, y2 };
}

async function sourcePathFor(post: typeof posts.$inferSelect, workDir: string) {
  const sourceArg = argValue("--source");
  if (sourceArg) {
    const source = resolve(sourceArg);
    if (!existsSync(source)) throw new Error(`source does not exist: ${source}`);
    return source;
  }

  const cached = join(`/tmp/veil-manual-track-${POST_ID}`, "source.mp4");
  if (existsSync(cached)) return cached;

  const sourcePath = join(workDir, "source.mp4");
  const sourceUrl = await presignPrivateGet(post.privateMediaKey, 300);
  writeFileSync(sourcePath, await fetchBuffer(sourceUrl));
  return sourcePath;
}

function extractFrame(sourcePath: string, outPath: string, time: number) {
  execFileSync(
    ffmpegInstaller.path,
    [
      "-y",
      "-ss",
      String(time),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ],
    { stdio: "ignore" },
  );
}

async function detectFrame(framePath: string, key: string) {
  await uploadPrivate(key, readFileSync(framePath), {
    contentType: "image/jpeg",
    upsert: true,
  });
  const url = await presignPrivateGet(key, 600);
  const replicate = getReplicate();
  const output = (await withReplicateRunRetry(() =>
    replicate.run(MODELS.groundingDino.ref, {
      input: {
        image: url,
        query: DESIRED_REGIONS.join(","),
        box_threshold: Number(argValue("--box-threshold") ?? process.env.BLUR_BOX_THRESHOLD ?? 0.3),
        text_threshold: 0.25,
        show_visualisation: false,
      },
    }),
  )) as GroundingDinoOutput;
  return output.detections ?? [];
}

async function withReplicateRunRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i += 1) {
    try {
      return await run();
    } catch (error) {
      const status =
        (error as { response?: { status?: number } })?.response?.status ??
        (error as { status?: number })?.status;
      const message = String((error as Error)?.message ?? "");
      const is429 = status === 429 || /\b429\b/.test(message);
      if (!is429 || i >= attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error)));
    }
  }
}

function retryDelayMs(error: unknown) {
  const retryAfter =
    (error as { response?: { headers?: { get?: (name: string) => string | null } } })?.response
      ?.headers?.get?.("retry-after") ??
    (error as { retry_after?: string | number })?.retry_after ??
    String((error as Error)?.message).match(/retry[_ -]?after["': ]+(\d+)/i)?.[1];
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.max(1_000, seconds * 1_000);
  return 12_000;
}

async function annotateFrame({
  framePath,
  outPath,
  detections,
  tracks,
  time,
  width,
  height,
}: {
  framePath: string;
  outPath: string;
  detections: Detection[];
  tracks: Array<{ label: string; rect: RegionRect | null }>;
  time: number;
  width: number;
  height: number;
}) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<style>text{font-family:Arial,sans-serif;font-size:22px;font-weight:700;paint-order:stroke;stroke:#000;stroke-width:4px;stroke-linejoin:round}.det{fill:none;stroke:#00e5ff;stroke-width:4}.manual{fill:none;stroke:#ff2b6d;stroke-width:5;stroke-dasharray:14 8}</style>`;
  svg += `<text x="24" y="34" fill="#fff">t=${time.toFixed(2)}s  cyan=model  pink=manual track</text>`;

  for (const detection of detections) {
    const box = detectionToBox(detection, width, height);
    svg += `<rect class="det" x="${box.x1}" y="${box.y1}" width="${box.x2 - box.x1}" height="${box.y2 - box.y1}" rx="8"/>`;
    svg += `<text x="${box.x1 + 6}" y="${Math.max(28, box.y1 - 8)}" fill="#00e5ff">${detection.label} ${round(detection.confidence)}</text>`;
  }

  for (const track of tracks) {
    if (!track.rect) continue;
    const box = rectToBox(track.rect, width, height);
    svg += `<rect class="manual" x="${box.x1}" y="${box.y1}" width="${box.x2 - box.x1}" height="${box.y2 - box.y1}" rx="8"/>`;
    svg += `<text x="${box.x1 + 6}" y="${Math.min(height - 12, box.y2 + 28)}" fill="#ff2b6d">${track.label}</text>`;
  }

  svg += "</svg>";
  await sharp(framePath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(outPath);
}

async function main() {
  const db = getDb();
  const post = await db.query.posts.findFirst({ where: eq(posts.id, POST_ID) });
  if (!post) throw new Error(`post not found: ${POST_ID}`);

  const workDir = resolve(argValue("--work-dir") ?? `/tmp/veil-detect-eval-${POST_ID}`);
  mkdirSync(workDir, { recursive: true });
  const sourcePath = await sourcePathFor(post, workDir);
  const meta = await probeVideo(sourcePath);

  const regionRows = await db.query.postRegions.findMany({
    where: eq(postRegions.postId, POST_ID),
    orderBy: [asc(postRegions.position)],
  });
  const tracks = regionRows.map((row) => ({
    label: row.label,
    track: (row.track ?? []) as RegionTrackPoint[],
  }));

  const requestedTimes = timesFromArgs();
  const times = requestedTimes.map((t) => Math.min(t, Math.max(0, meta.durationSec - 0.02)));
  const runKey = `debug/detection-eval-${POST_ID}/${Date.now()}`;
  const results = [];

  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    const framePath = join(workDir, `frame-${String(i + 1).padStart(2, "0")}.jpg`);
    const annotatedPath = join(workDir, `annotated-${String(i + 1).padStart(2, "0")}.jpg`);
    extractFrame(sourcePath, framePath, t);
    const detections = await detectFrame(framePath, `${runKey}/frame-${i + 1}.jpg`);
    const sampledTracks = tracks.map((track) => ({
      label: track.label,
      rect: sampleTrack(track.track, t),
    }));
    await annotateFrame({
      framePath,
      outPath: annotatedPath,
      detections,
      tracks: sampledTracks,
      time: t,
      width: meta.width,
      height: meta.height,
    });
    results.push({
      t,
      framePath,
      annotatedPath,
      detections: detections.map((detection) => ({
        label: detection.label,
        confidence: round(detection.confidence),
        bbox: detection.bbox.map(round),
      })),
      manualTracks: sampledTracks,
    });
  }

  console.log(JSON.stringify({ postId: POST_ID, workDir, sourcePath, times, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
