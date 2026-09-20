import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getScanProvider, scanningEnabled, scanningRequired, type ScanReason } from "@/lib/moderation/scan";
import { checkPerformerRecords } from "@/lib/moderation/records";
import { contentReports } from "@/lib/db/schema";
import { uploadPrivate, presignPrivateGet } from "@/lib/blob";
import {
  markUserCreator,
  getPostsByCreator,
} from "@/lib/db/queries";
import { formatUsd, STABLECOIN_DECIMALS } from "@/lib/constants";
import { createJob, getJob, updateJob } from "@/lib/blur/jobs";
import { getDb } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";

export const runtime = "nodejs";

/**
 * GET /api/posts — a creator's own posts. Powers the "attach locked
 * content" picker in DMs (creator-only PPV). Previews are presigned for display.
 */
export async function GET() {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const rows = await getPostsByCreator(user.id);
  const posts = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      title: p.title,
      unlockPrice: p.unlockPrice,
      priceLabel: `$${formatUsd(p.unlockPrice)}`,
      mediaType: p.mediaType,
      previewUrl: await presignPrivateGet(p.blurredPreviewUrl, 3600),
    })),
  );
  return Response.json({ posts });
}

// Soft cap to stay well under serverless request-body limits. Large videos
// should use a direct Supabase Storage upload flow — a follow-up.
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Creator upload.
 *
 * With autoBlur=true, this is the UPLOAD side of the auto-blur flow:
 *   1. store the raw media as a private object (this is what the blur pipeline reads)
 *   2. enqueue a `blur_jobs` row (status "uploaded") carrying the draft caption +
 *      price — the POST itself is created later, at approve, by publishJob()
 *   3. best-effort kick off detection IF Replicate is configured (never blocks)
 *
 * With autoBlur=false, the raw upload is published directly and no blur job is
 * created. For the blur path, nothing is public until the creator approves the
 * preview (auto-blur PRD §11, fail-closed).
 *
 *   POST /api/posts  (multipart/form-data: file, title, price)
 *   Set autoBlur=false to publish the upload directly without creating a blur job.
 */
/**
 * Build a teaser for a paid image that is safe to serve to people who haven't
 * paid — it is presigned to every client in the feed.
 *
 * The detail is *destroyed*, not hidden: the image is downscaled to a thumbnail
 * before being blurred, so the original pixels are gone from the file rather
 * than merely obscured. A CSS filter or a large-image blur can be undone by the
 * viewer (or simply removed); resampling to 64px cannot.
 */
async function makeSafePreview(buffer: Buffer, creatorId: string): Promise<string> {
  const preview = await sharp(buffer)
    .rotate() // honour EXIF orientation before we throw the metadata away
    .resize(64, 80, { fit: "cover" })
    .blur(8)
    .jpeg({ quality: 40 })
    .toBuffer();

  const blob = await uploadPrivate(`previews/${creatorId}/${randomUUID()}.jpg`, preview, {
    contentType: "image/jpeg",
  });
  return blob.pathname;
}

/**
 * Scan uploaded media before it can be served, and quarantine anything the
 * scanner doesn't clear.
 *
 * The bias is deliberate: `flagged` AND `error` both quarantine. A scanner that
 * is down must never mean "publish it anyway" — that inverts the entire point.
 * A flag also opens a real report so a human sees it, and CSAM/underage hits are
 * logged loudly because they carry strict liability.
 */
async function scanBeforePublish(
  media: Buffer,
  mediaType: "image" | "video",
  contentType: string,
): Promise<{
  scanStatus: "skipped" | "clean" | "flagged";
  scanDetail: string | null;
  scannedAt: Date | null;
  reason?: ScanReason;
}> {
  if (!scanningEnabled()) {
    // Fail CLOSED in production: no scanner means nothing gets examined, and
    // publishing unexamined media under strict CSAM liability is the one
    // outcome that must be impossible. Quarantine instead — same path a scanner
    // error takes. Dev and tests keep the convenient skip.
    if (scanningRequired()) {
      console.error("[scan] no scanner configured in production — quarantining upload");
      return {
        scanStatus: "flagged",
        scanDetail: "no scanner configured — quarantined pending review",
        scannedAt: new Date(),
        reason: "other",
      };
    }
    return { scanStatus: "skipped", scanDetail: null, scannedAt: null };
  }

  const verdict = await getScanProvider().scan({ media, mediaType, contentType });
  const scannedAt = new Date();

  if (verdict.status === "clean") {
    return { scanStatus: "clean", scanDetail: null, scannedAt };
  }
  if (verdict.status === "error") {
    // Quarantine, don't publish. Surfaces as `flagged` for a human to clear.
    console.error(`[scan] scanner error — quarantining upload: ${verdict.detail}`);
    return {
      scanStatus: "flagged",
      scanDetail: `scanner unavailable: ${verdict.detail}`,
      scannedAt,
      reason: "other",
    };
  }
  return {
    scanStatus: "flagged",
    scanDetail: verdict.detail,
    scannedAt,
    reason: verdict.reason,
  };
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  /**
   * Only what this route reads.
   *
   * Two incompatible `FormData` types are visible during the production build —
   * the ambient DOM one and the undici one `.formData()` actually returns — and
   * annotating either way fails. `tsc --noEmit` sees only one of them and
   * passes, which is why this only surfaces at build time.
   */
  let form: { get(name: string): unknown };
  try {
    form = (await req.formData()) as unknown as typeof form;
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const title = (form.get("title") as string | null)?.trim() ?? "";
  const price = (form.get("price") as string | null)?.trim() ?? "";
  const autoBlur = form.get("autoBlur") !== "false";

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Media file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "File too large (max 25 MB for now)" },
      { status: 413 },
    );
  }
  if (!title) {
    return Response.json({ error: "Caption is required" }, { status: 400 });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return Response.json({ error: "Invalid price" }, { status: 400 });
  }
  // USDC has 6 decimals; a price finer than that cannot be charged exactly. The
  // ledger stores 8dp, so such a price gets authorised at one rounding and
  // settled at another — the escrow reserving less than the transfer spends.
  // Rejecting it here means that mismatch cannot exist anywhere downstream.
  if ((price.split(".")[1]?.length ?? 0) > STABLECOIN_DECIMALS) {
    return Response.json(
      { error: `Price cannot have more than ${STABLECOIN_DECIMALS} decimal places` },
      { status: 400 },
    );
  }

  const mediaType: "image" | "video" = file.type.startsWith("video")
    ? "video"
    : "image";

  // 1. Store the raw upload privately. The pipeline presigns this on demand.
  const creator = await markUserCreator(user.id);

  // §2257: no verified age/consent record, no publishing. Checked before the
  // media is stored so we don't accumulate content we were never allowed to take.
  const records = await checkPerformerRecords(creator.id);
  if (!records.ok) {
    return Response.json({ error: records.reason, code: records.code }, { status: 403 });
  }
  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (mediaType === "video" ? "mp4" : "jpg");
  const buffer = Buffer.from(await file.arrayBuffer());

  let rawBlobKey: string;
  try {
    const blob = await uploadPrivate(
      `uploads/${creator.id}/${randomUUID()}.${ext}`,
      buffer,
      {
        contentType: file.type || "application/octet-stream",
      },
    );
    rawBlobKey = blob.pathname;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 502 },
    );
  }

  if (!autoBlur) {
    // A paid post needs a preview that is safe to hand to people who have NOT
    // paid — the feed presigns it for every client. Pointing it at the raw file
    // and blurring in CSS is not a paywall: deleting one style rule in devtools,
    // or copying the URL out of the network tab, reveals the full media.
    // So derive a preview whose pixels genuinely cannot reconstruct the original.
    let previewKey = rawBlobKey; // free posts: the media is public anyway
    if (priceNum > 0) {
      if (mediaType === "video") {
        // No safe poster can be derived here without the blur pipeline, and
        // shipping frame 0 of paid video is the same leak.
        return Response.json(
          {
            error:
              "Paid video requires auto-blur — there's no safe preview to show people who haven't paid.",
          },
          { status: 400 },
        );
      }
      try {
        previewKey = await makeSafePreview(buffer, creator.id);
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : "Could not build a preview" },
          { status: 502 },
        );
      }
    }

    // Examine the media before anyone can see it. Quarantined content is
    // written with scan_status='flagged', which every read path excludes, so a
    // flagged post is never served even though the row exists for review.
    const scan = await scanBeforePublish(buffer, mediaType, file.type || "application/octet-stream");

    const [post] = await getDb()
      .insert(posts)
      .values({
        creatorId: creator.id,
        title,
        blurredPreviewUrl: previewKey,
        privateMediaKey: rawBlobKey,
        unlockPrice: priceNum.toFixed(8),
        mediaType,
        accessMode: "full",
        isPublished: true,
        scanStatus: scan.scanStatus,
        scanDetail: scan.scanDetail,
        scannedAt: scan.scannedAt,
      })
      .returning({ id: posts.id });

    if (scan.scanStatus === "flagged") {
      // Open a report so a human actually sees it rather than it sitting in a
      // column nobody queries.
      await getDb().insert(contentReports).values({
        postId: post.id,
        reportedUserId: creator.id,
        reason: scan.reason ?? "other",
        detail: `automated scan: ${scan.scanDetail ?? "flagged"}`,
      });
      if (scan.reason === "csam" || scan.reason === "underage") {
        console.error(
          `[scan] URGENT: automated scan flagged ${scan.reason} on post ${post.id} — quarantined, needs immediate human review`,
        );
      }
      return Response.json(
        {
          postId: post.id,
          status: "under_review",
          message: "Your post is being reviewed before it goes live.",
        },
        { status: 202 },
      );
    }

    return Response.json({
      postId: post.id,
      status: "published",
    });
  }

  // 2. Blur job (the handoff) carrying the draft caption + price. publishJob()
  //    creates the public post from these at approve time.
  const job = await createJob({ creatorId: creator.id, mediaType, rawBlobKey });
  await updateJob(job.id, {
    draftTitle: title,
    draftPrice: priceNum.toFixed(8),
  });

  // 4. Optional handoff trigger via the blur pipeline's canonical entry point
  //    (`kickOff` routes to the single Cog or the multi-stage chain). Only if
  //    Replicate is configured; never let a failure fail the upload.
  const blurConfigured =
    !!process.env.REPLICATE_API_TOKEN &&
    (!!process.env.REPLICATE_VEIL_AUTOBLUR_VERSION ||
      (mediaType === "image"
        ? !!process.env.REPLICATE_GROUNDED_SAM_VERSION
        : !!process.env.REPLICATE_GROUNDING_DINO_VERSION));

  // Say so immediately rather than parking the job at "uploaded" — the client
  // polls that state forever showing "Queued for auto-blur", and nothing is
  // queued, so the post can never reach ready_for_review and never publishes.
  // Failing is also the safe choice: auto-blur implies the creator reviews the
  // result before it goes live, so silently publishing something else could
  // expose media they wanted to check first.
  if (!blurConfigured) {
    await updateJob(job.id, { status: "failed", error: "auto-blur is not configured" });
    return Response.json(
      {
        error:
          "Auto-blur isn't available right now. Turn it off to publish with a standard blurred teaser, or try again later.",
        code: "autoblur_unavailable",
      },
      { status: 503 },
    );
  }

  {
    try {
      const { kickOff } = await import("@/lib/blur/state");
      await kickOff({ id: job.id, rawBlobKey, mediaType });
    } catch (err) {
      // Non-fatal: the Replicate `create` can fail transiently (402/429/5xx).
      // The job stays "uploaded" with no prediction id; the reconcile cron
      // (/api/blur/reconcile) re-kicks orphaned uploads, so it self-heals.
      console.error("blur pipeline trigger failed (will be reconciled):", err);
    }
  }
  const latestJob = await getJob(job.id);

  return Response.json({
    jobId: job.id,
    status: latestJob?.status ?? (blurConfigured ? "detecting" : "uploaded"),
  });
}
