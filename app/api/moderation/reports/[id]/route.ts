import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contentReports, posts } from "@/lib/db/schema";
import { requireModerator, moderationForbidden } from "@/lib/moderation-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "takedown" | "dismiss" | "reviewing";

/**
 * Act on a report.
 *
 * `takedown` is the one that matters: it stamps `posts.taken_down_at`, which
 * every post read path filters on, so the content stops being served, stops
 * being purchasable (in-app and via x402), and stops appearing in the feed —
 * immediately, everywhere, without deleting the row we may need as evidence.
 *
 * A takedown is intentionally not reversible through this endpoint. Restoring
 * removed content should require a deliberate, logged act, not a fat-fingered
 * PATCH.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireModerator(req))) return moderationForbidden();

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
  };

  const action = body.action as Action;
  if (!["takedown", "dismiss", "reviewing"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: takedown, dismiss, reviewing" },
      { status: 400 },
    );
  }

  const report = await getDb().query.contentReports.findFirst({
    where: eq(contentReports.id, id),
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;

  if (action === "takedown") {
    if (!report.postId) {
      return NextResponse.json(
        { error: "This report has no post to remove" },
        { status: 400 },
      );
    }
    // Content first, bookkeeping second: if this transaction half-fails, the
    // safe outcome is "removed but the report still looks open", never "report
    // closed while the content is still live".
    await getDb()
      .update(posts)
      .set({ takenDownAt: new Date(), takedownReason: report.reason })
      .where(eq(posts.id, report.postId));

    console.error(
      `[moderation] TAKEDOWN post=${report.postId} report=${report.id} reason=${report.reason}`,
    );
  }

  await getDb()
    .update(contentReports)
    .set({
      status: action === "takedown" ? "actioned" : action === "dismiss" ? "dismissed" : "reviewing",
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(eq(contentReports.id, id));

  return NextResponse.json({ ok: true, action });
}
