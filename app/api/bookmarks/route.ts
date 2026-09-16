import { listBookmarks } from "@/lib/db/social";
import { requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const rows = await listBookmarks(auth.user.id);
  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      postId: r.postId,
      title: r.title,
      creator: r.creator,
      avatar: r.avatar,
      at: r.at,
    })),
  });
}
