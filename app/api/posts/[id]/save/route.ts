import { NextRequest, NextResponse } from "next/server";
import { togglePostSave } from "@/lib/db/social";
import { getPost } from "@/lib/db/queries";
import { setAccountCookie } from "@/lib/app-user";
import { jsonError, requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

/** POST /api/posts/[id]/save — toggle the current user's bookmark on a post. */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/posts/[id]/save">,
) {
  const { id } = await ctx.params;
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const post = await getPost(id);
  if (!post) return jsonError("Post not found", 404);

  const result = await togglePostSave(auth.user.id, id);
  return setAccountCookie(NextResponse.json(result), auth.user.id);
}
