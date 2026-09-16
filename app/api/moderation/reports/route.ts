import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contentReports, posts, users } from "@/lib/db/schema";
import { requireModerator, moderationForbidden } from "@/lib/moderation-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The moderation queue.
 *
 * Operator-only. Ordered so the reports that carry legal exposure surface first:
 * CSAM, then underage/non-consensual, then everything else — oldest first within
 * a tier, so nothing rots at the bottom.
 */
export async function GET(req: NextRequest) {
  if (!(await requireModerator(req))) return moderationForbidden();

  const status = req.nextUrl.searchParams.get("status") ?? "open";

  const rows = await getDb()
    .select({
      id: contentReports.id,
      reason: contentReports.reason,
      detail: contentReports.detail,
      status: contentReports.status,
      createdAt: contentReports.createdAt,
      postId: contentReports.postId,
      postTitle: posts.title,
      postTakenDownAt: posts.takenDownAt,
      creatorUsername: users.username,
    })
    .from(contentReports)
    .leftJoin(posts, eq(contentReports.postId, posts.id))
    .leftJoin(users, eq(contentReports.reportedUserId, users.id))
    .where(
      status === "all"
        ? sql`true`
        : eq(contentReports.status, status as "open" | "reviewing" | "actioned" | "dismissed"),
    )
    .orderBy(
      // Severity first: these map to strict-liability obligations.
      sql`case ${contentReports.reason}
            when 'csam' then 0
            when 'underage' then 1
            when 'non_consensual' then 2
            else 3 end`,
      asc(contentReports.createdAt),
    )
    .limit(100);

  const [{ open }] = await getDb()
    .select({ open: sql<number>`count(*)::int` })
    .from(contentReports)
    .where(eq(contentReports.status, "open"));

  return NextResponse.json({ openCount: open, reports: rows });
}

/** How many posts are currently live and unreviewed — operational context. */
export async function HEAD() {
  const [{ live }] = await getDb()
    .select({ live: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(eq(posts.isPublished, true), isNull(posts.takenDownAt)));
  return new NextResponse(null, { headers: { "x-live-posts": String(live) } });
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { allow: "GET, HEAD" } });
}
