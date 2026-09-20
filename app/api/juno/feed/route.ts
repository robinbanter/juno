import { globalActivity, hydratePool } from "@/lib/juno/chain";
import { mediaKind, mediaSrc } from "@/lib/juno/media";
import { identicon } from "@/lib/juno/identicon";
import { shortAddress } from "@/lib/juno/format";
import { listPosts, replyCounts } from "@/lib/juno/posts";
import { listPools } from "@/lib/juno/registry";
import { junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * How many pools the trade half of the feed walks.
 *
 * Each pool costs a signature listing plus a paced walk of its transactions,
 * against an endpoint with no indexer behind it. Twelve fills a screen from the
 * pools most likely to have traded recently; scanning the whole registry cost
 * about seventeen seconds and found nothing extra, because most pools have
 * never traded at all.
 */
const POOLS_SCANNED = 8;

type FeedItem =
  | {
      kind: "trade";
      id: string;
      timestamp: string;
      side: "buy" | "sell";
      amount: number;
      valueUsd: number;
      /** What one token cost in this trade — value over size. */
      price: number;
      /** The coin's live price now, so a card can show the move since. */
      priceNow: number | null;
      currency: string;
      signature?: string;
      actor: { handle: string; avatarUrl: string };
      coin: { address: string; name: string; symbol: string; mediaUrl: string | null; mediaKind: string };
    }
  | {
      kind: "post";
      id: string;
      timestamp: string;
      body: string;
      author: { wallet: string; handle: string; avatarUrl: string };
      mediaUrl: string | null;
      mediaKind: string | null;
      replyCount: number;
      coin: { address: string; name: string; symbol: string } | null;
    };

/**
 * The social feed: real trades and creator posts, newest first.
 *
 * The two halves have opposite natures and are merged rather than unified.
 * A trade is a fact about the chain — re-read every time, never stored,
 * verifiable by anyone with the signature. A post is something a person wrote
 * and lives in Postgres. Interleaving them by timestamp is the only thing they
 * share.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 80);

    const pools = await listPools(POOLS_SCANNED);
    const byMint = new Map(pools.map((row) => [row.baseMint, row]));

    const [trades, posts] = await Promise.all([
      globalActivity(pools, 8, 2, limit),
      listPosts({ limit }),
    ]);

    // One hydration per coin that appears, not per row: a feed shows the same
    // coin several times and each hydration is a pool read.
    const mentioned = [...new Set(trades.map((trade) => trade.coinAddress))];
    const live = new Map<string, { price: number; currency: string }>();
    for (const mint of mentioned) {
      const row = byMint.get(mint);
      if (!row) continue;
      const coin = await hydratePool(row).catch(() => null);
      if (coin) live.set(mint, { price: coin.priceUsd, currency: coin.marketCapCurrency });
    }

    const items: FeedItem[] = [];

    for (const trade of trades) {
      const row = byMint.get(trade.coinAddress);
      items.push({
        kind: "trade",
        id: trade.id,
        timestamp: trade.timestamp,
        side: trade.side,
        amount: trade.amount,
        valueUsd: trade.valueUsd,
        // Derived, never assumed: a zero-size row has no price to report.
        price: trade.amount > 0 ? trade.valueUsd / trade.amount : 0,
        priceNow: live.get(trade.coinAddress)?.price ?? null,
        currency: live.get(trade.coinAddress)?.currency ?? "USD",
        signature: trade.signature,
        actor: trade.actor,
        coin: {
          address: trade.coinAddress,
          name: trade.coinName,
          symbol: row?.symbol ?? "",
          mediaUrl: mediaSrc(row?.mediaUrl) ?? null,
          mediaKind: mediaKind(row?.mediaMime),
        },
      });
    }

    const counts = await replyCounts(posts.map((post) => post.id)).catch(
      () => new Map<string, number>(),
    );

    for (const post of posts) {
      const row = post.baseMint ? byMint.get(post.baseMint) : undefined;
      items.push({
        kind: "post",
        id: post.id,
        timestamp: post.createdAt.toISOString(),
        body: post.body,
        author: {
          wallet: post.authorWallet,
          handle: shortAddress(post.authorWallet, 4, 4),
          avatarUrl: identicon(post.authorWallet),
        },
        mediaUrl: mediaSrc(post.mediaUrl) ?? null,
        mediaKind: post.mediaMime ? mediaKind(post.mediaMime) : null,
        replyCount: counts.get(post.id) ?? 0,
        coin: row
          ? { address: row.baseMint, name: row.name, symbol: row.symbol }
          : null,
      });
    }

    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return junoJson({ cluster: cluster(), items: items.slice(0, limit) });
  });
}
