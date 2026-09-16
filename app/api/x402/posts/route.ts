import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { x402Network, x402PaymentAsset, facilitatorUrl } from "@/lib/x402";
import { APP_URL } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discovery for x402 clients: what's purchasable, at what price, in what asset.
 *
 * Free by design — an agent has to be able to see the menu before it can decide
 * to pay. Only public metadata is exposed here (title, price, blurred preview);
 * the private media is what the paid endpoint sells.
 */
export async function GET() {
  const rows = await getDb()
    .select({
      id: posts.id,
      title: posts.title,
      price: posts.unlockPrice,
      mediaType: posts.mediaType,
      preview: posts.blurredPreviewUrl,
      createdAt: posts.createdAt,
    })
    .from(posts)
    // Never offer a taken-down or quarantined post for sale.
    .where(
      and(
        eq(posts.isPublished, true),
        isNull(posts.takenDownAt),
        inArray(posts.scanStatus, ["skipped", "clean"]),
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(50);

  return NextResponse.json({
    x402Version: 2,
    network: x402Network(),
    asset: x402PaymentAsset(),
    facilitator: facilitatorUrl(),
    resources: rows.map((p) => ({
      id: p.id,
      title: p.title,
      mediaType: p.mediaType,
      price: `$${Number(p.price).toFixed(2)}`,
      preview: p.preview,
      // GET this with an x402 client to pay and receive the media URL.
      url: `${APP_URL}/api/x402/posts/${p.id}`,
    })),
  });
}
