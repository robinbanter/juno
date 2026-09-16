import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { contentReports, posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAppUser } from "@/lib/app-user";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeDbTextMax } from "@/lib/db/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = [
  "csam",
  "non_consensual",
  "underage",
  "violence",
  "copyright",
  "impersonation",
  "spam",
  "other",
] as const;

type Reason = (typeof REASONS)[number];

/** Reasons that must never wait in a queue. */
const URGENT: ReadonlySet<string> = new Set(["csam", "underage", "non_consensual"]);

/**
 * Report content.
 *
 * Intentionally usable without an account: requiring a login to report abuse
 * suppresses exactly the reports that matter most. That means it's spammable, so
 * it's rate limited per IP — a blunt key, but the right trade here (a shared IP
 * being throttled is better than abuse going unreported).
 *
 * This records the report and routes the urgent ones loudly. It is NOT a
 * moderation system on its own: automated CSAM scanning, §2257 age/consent
 * records, and a DMCA agent are vendor and legal decisions that belong on top.
 */
export async function POST(req: NextRequest) {
  // `x-forwarded-for` is spoofable; it's a speed bump, not an identity.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limited = rateLimit(`report:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    postId?: unknown;
    reason?: unknown;
    detail?: unknown;
  };

  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!REASONS.includes(reason as Reason)) {
    return NextResponse.json(
      { error: `reason must be one of: ${REASONS.join(", ")}` },
      { status: 400 },
    );
  }

  const postId = typeof body.postId === "string" ? body.postId : null;
  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const post = await getDb().query.posts.findFirst({
    where: eq(posts.id, postId),
    columns: { id: true, creatorId: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // A reporter may be signed in or not; either is fine.
  const reporter = await getCurrentAppUser().catch(() => null);

  const [report] = await getDb()
    .insert(contentReports)
    .values({
      postId: post.id,
      reportedUserId: post.creatorId,
      reporterId: reporter?.id ?? null,
      reason: reason as Reason,
      // sanitize + cap: a NUL here threw on INSERT, and this route needs no account.
      detail: sanitizeDbTextMax(body.detail, 2000) || null,
    })
    .returning({ id: contentReports.id });

  if (URGENT.has(reason)) {
    // Deliberately loud. These carry strict liability and must not sit unseen in
    // a queue — wire this to a pager, not just stdout, before taking real users.
    console.error(
      `[moderation] URGENT report ${report.id}: reason=${reason} post=${post.id} — requires immediate human review`,
    );
  }

  // Never reveal whether the post was already reported or taken down: that would
  // let a reporter probe moderation state.
  return NextResponse.json({ ok: true, reportId: report.id }, { status: 201 });
}
