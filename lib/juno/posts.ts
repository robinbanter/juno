import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { junoPosts } from "@/lib/db/schema";
import { cluster } from "./cluster";
import { CallerError } from "./api";

/**
 * Creator posts — the half of the social feed that is not a trade.
 *
 * Juno's feed mixes two kinds of item, and they have opposite storage needs.
 * Trades are facts about the chain: never stored, always re-read, verifiable by
 * anyone. A post is something a person wrote, which has nowhere else to live.
 *
 * A post may reference a coin or stand alone, so a creator can talk about a
 * launch without every message having to be one.
 */

export type JunoPostRow = typeof junoPosts.$inferSelect;

export type NewPost = {
  authorWallet: string;
  body: string;
  /** Optional: the coin this post is about. */
  baseMint?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
};

/** Long enough for a thought, short enough to read in a feed. */
export const MAX_POST_LENGTH = 500;

export async function createPost(input: NewPost): Promise<JunoPostRow> {
  const body = input.body.trim();
  if (body.length === 0) throw new CallerError("A post needs a body");
  if (body.length > MAX_POST_LENGTH) {
    throw new CallerError(`A post must be ${MAX_POST_LENGTH} characters or fewer`);
  }

  const [row] = await getDb()
    .insert(junoPosts)
    .values({
      // Trimmed to the column width; still 128 bits of entropy.
      id: randomUUID().replace(/-/g, "").slice(0, 32),
      authorWallet: input.authorWallet,
      cluster: cluster(),
      body,
      baseMint: input.baseMint ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaMime: input.mediaMime ?? null,
    })
    .returning();

  return row;
}

/**
 * Newest first, scoped to the current cluster.
 *
 * Paginated by timestamp rather than offset: the feed has things inserted at
 * its head continuously, and an offset walks backwards through a list that is
 * shifting underneath it, showing the same post twice and skipping another.
 */
export async function listPosts(options: {
  limit?: number;
  before?: Date;
  authorWallet?: string;
  baseMint?: string;
} = {}): Promise<JunoPostRow[]> {
  const filters = [eq(junoPosts.cluster, cluster())];
  if (options.before) filters.push(lt(junoPosts.createdAt, options.before));
  if (options.authorWallet) filters.push(eq(junoPosts.authorWallet, options.authorWallet));
  if (options.baseMint) filters.push(eq(junoPosts.baseMint, options.baseMint));

  return getDb()
    .select()
    .from(junoPosts)
    .where(and(...filters))
    .orderBy(desc(junoPosts.createdAt))
    .limit(Math.min(options.limit ?? 30, 100));
}

export async function getPost(id: string): Promise<JunoPostRow | null> {
  const [row] = await getDb().select().from(junoPosts).where(eq(junoPosts.id, id)).limit(1);
  return row ?? null;
}
