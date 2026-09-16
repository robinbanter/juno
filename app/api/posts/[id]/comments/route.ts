import { NextRequest, NextResponse } from "next/server";
import { addComment, listComments } from "@/lib/db/social";
import { getPost } from "@/lib/db/queries";
import {
  getCurrentAppUser,
  setAccountCookie,
} from "@/lib/app-user";
import { jsonError, requireAppUserForRoute } from "@/lib/api/route";
import { sanitizeDbText } from "@/lib/db/text";

export const runtime = "nodejs";

/** GET /api/posts/[id]/comments — threaded comments for a post (public). */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/posts/[id]/comments">,
) {
  const { id } = await ctx.params;
  // Viewer is optional — anyone can read; a signed-in viewer gets `liked` flags.
  const viewer = await getCurrentAppUser().catch(() => null);
  const items = await listComments(id, viewer?.id);
  return NextResponse.json({ items });
}

/** POST /api/posts/[id]/comments — add a comment or reply (auth required). */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/posts/[id]/comments">,
) {
  const { id } = await ctx.params;
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const post = await getPost(id);
  if (!post) return jsonError("Post not found", 404);

  const { body, parentId } = (await req.json()) as {
    body?: string;
    parentId?: string | null;
  };
  // sanitize before trim: a NUL survives trim() and throws on INSERT.
  const text = sanitizeDbText(body).trim();
  if (!text) {
    return jsonError("Comment cannot be empty", 400);
  }
  if (text.length > 500) {
    return jsonError("Comment is too long", 400);
  }

  const comment = await addComment(auth.user.id, id, text, parentId ?? null);
  return setAccountCookie(NextResponse.json({ comment }), auth.user.id);
}
