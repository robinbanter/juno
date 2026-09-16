import { NextRequest, NextResponse } from "next/server";
import { toggleCommentLike } from "@/lib/db/social";
import { setAccountCookie } from "@/lib/app-user";
import { requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

/** POST /api/comments/[id]/like — toggle the current user's like on a comment. */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/comments/[id]/like">,
) {
  const { id } = await ctx.params;
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const result = await toggleCommentLike(auth.user.id, id);
  return setAccountCookie(NextResponse.json(result), auth.user.id);
}
