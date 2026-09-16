import { NextRequest, after } from "next/server";
import { getPost } from "@/lib/db/queries";
import { getThreadFor, markThreadRead, sendMessage } from "@/lib/db/messages";
import { buildConversationView } from "@/lib/messages-view";
import { maybeReplyToBotThread } from "@/lib/bot";
import { jsonError, requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

/**
 * GET /api/messages/[id] — a conversation. PPV messages are resolved
 * per-viewer: the sender sees their locked card, an unlocked recipient gets a
 * presigned real-media URL, everyone else gets the blurred preview + price.
 * Used for client refreshes after a send — the initial load is server-rendered
 * by app/messages/[id]/page.tsx via the same builder.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/messages/[id]">,
) {
  const { id } = await ctx.params;
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const view = await buildConversationView(auth.user.id, id);
  if (!view) return jsonError("Thread not found", 404);

  // Clearing the unread badge is a side effect — don't make the response wait
  // on the write. `after` runs it once the response is on its way.
  after(() => markThreadRead(id, auth.user.id));

  return Response.json(view);
}

/**
 * POST /api/messages/[id] — send a message.
 * Body: { kind?: "text"|"ppv", body?, postId? }. PPV is creator-only and
 * must reference one of the creator's own posts (it reuses the unlock flow).
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/messages/[id]">,
) {
  const { id } = await ctx.params;
  const { kind = "text", body, postId } = (await req.json()) as {
    kind?: "text" | "ppv";
    body?: string;
    postId?: string;
  };

  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;
  const { user } = auth;

  const thread = await getThreadFor(user.id, id);
  if (!thread) return jsonError("Thread not found", 404);

  if (kind === "ppv") {
    if (thread.creatorId !== user.id) {
      return jsonError("Only the creator can send locked content", 403);
    }
    if (!postId) {
      return jsonError("postId required for PPV", 400);
    }
    const post = await getPost(postId);
    if (!post || post.creatorId !== user.id) {
      return jsonError("Not your post", 400);
    }
    const msg = await sendMessage({
      threadId: id,
      senderId: user.id,
      kind: "ppv",
      body: body?.trim() || null,
      postId,
    });
    return Response.json({ ok: true, id: msg.id });
  }

  const text = body?.trim();
  if (!text) return jsonError("Empty message", 400);

  const msg = await sendMessage({
    threadId: id,
    senderId: user.id,
    kind: "text",
    body: text,
  });
  const botReply = await maybeReplyToBotThread(id, user.id);
  return Response.json({ ok: true, id: msg.id, botReply });
}
