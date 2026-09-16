import { getUnlockedPosts } from "@/lib/db/queries";
import { presignPrivateGet } from "@/lib/blob";
import { requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

/**
 * GET /api/collection — the fan's unlocked posts as gallery tiles.
 * Each tile presigns the REAL (unblurred) media: having paid is the access
 * grant, so the collection shows what they own, not the public preview.
 */
export async function GET() {
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const rows = await getUnlockedPosts(auth.user.id);
  const items = await Promise.all(
    rows.map(async (r) => ({
      postId: r.postId,
      title: r.title,
      mediaType: r.mediaType,
      unlockPrice: r.unlockPrice,
      creator: r.creatorUsername,
      url: await presignPrivateGet(r.privateMediaKey, 3600),
    })),
  );

  return Response.json({ items });
}
