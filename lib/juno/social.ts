import "server-only";

import { MongoClient, type Collection, type Db } from "mongodb";

/**
 * Social state: comments, likes and follows.
 *
 * Deliberately not Postgres. The pool registry is relational and small; this
 * is append-heavy, per-coin, and schema-loose — and keeping it separate means
 * a comment outage can never take the market data down with it.
 *
 * Nothing here is authoritative about money. Trades live on-chain.
 */

declare global {
  // eslint-disable-next-line no-var
  var __junoMongo: MongoClient | undefined;
}

function client(): MongoClient {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  // Reused across hot reloads; a new client per request exhausts the pool.
  globalThis.__junoMongo ??= new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 5,
  });
  return globalThis.__junoMongo;
}

async function db(): Promise<Db> {
  const c = client();
  await c.connect();
  return c.db(process.env.MONGODB_DB || "juno");
}

export type JunoComment = {
  id: string;
  coinMint: string;
  wallet: string;
  body: string;
  /** Set when the comment was attached to a trade. */
  side?: "buy" | "sell";
  /** The trade's signature, so the comment is verifiable. */
  signature?: string;
  createdAt: string;
};

type CommentDoc = Omit<JunoComment, "id" | "createdAt"> & {
  cluster: string;
  createdAt: Date;
};

async function comments(): Promise<Collection<CommentDoc>> {
  const collection = (await db()).collection<CommentDoc>("comments");
  // Idempotent; Mongo ignores a create for an index that already exists.
  await collection
    .createIndex({ coinMint: 1, cluster: 1, createdAt: -1 })
    .catch(() => undefined);
  return collection;
}

export const MAX_COMMENT = 280;

export async function listComments(
  coinMint: string,
  cluster: string,
  limit = 50,
): Promise<JunoComment[]> {
  const docs = await (await comments())
    .find({ coinMint, cluster })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    coinMint: doc.coinMint,
    wallet: doc.wallet,
    body: doc.body,
    side: doc.side,
    signature: doc.signature,
    createdAt: doc.createdAt.toISOString(),
  }));
}

export async function addComment(input: {
  coinMint: string;
  cluster: string;
  wallet: string;
  body: string;
  side?: "buy" | "sell";
  signature?: string;
}): Promise<JunoComment> {
  const body = input.body.trim().slice(0, MAX_COMMENT);
  if (!body) throw new Error("Comment is empty");

  const doc: CommentDoc = {
    coinMint: input.coinMint,
    cluster: input.cluster,
    wallet: input.wallet,
    body,
    side: input.side,
    signature: input.signature,
    createdAt: new Date(),
  };

  const result = await (await comments()).insertOne(doc);
  return {
    id: result.insertedId.toString(),
    coinMint: doc.coinMint,
    wallet: doc.wallet,
    body: doc.body,
    side: doc.side,
    signature: doc.signature,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function countComments(coinMint: string, cluster: string): Promise<number> {
  return (await comments()).countDocuments({ coinMint, cluster });
}

/* ------------------------------------------------------------------ */
/* Likes                                                               */
/* ------------------------------------------------------------------ */

/**
 * A like is the tuple itself.
 *
 * Keyed on (coinMint, cluster, wallet) with a unique index, so liking twice is
 * a no-op rather than a double count — the idempotency lives in the database
 * where a retry, a double-tap and two open tabs all hit the same constraint.
 * Storing a `liked: boolean` and toggling it in application code would race;
 * inserting and deleting a row cannot.
 *
 * Cluster is part of the key because the same mint address means different
 * things on devnet and mainnet, and a like should not follow a coin across.
 */
type LikeDoc = {
  coinMint: string;
  cluster: string;
  wallet: string;
  createdAt: Date;
};

async function likes(): Promise<Collection<LikeDoc>> {
  const collection = (await db()).collection<LikeDoc>("likes");
  // Idempotent; Mongo ignores a create for an index that already exists.
  await collection
    .createIndex({ coinMint: 1, cluster: 1, wallet: 1 }, { unique: true })
    .catch(() => undefined);
  await collection.createIndex({ coinMint: 1, cluster: 1 }).catch(() => undefined);
  return collection;
}

export type LikeState = { count: number; liked: boolean };

/**
 * Like count, plus whether this wallet is one of them.
 *
 * `wallet` is optional: a visitor with no wallet connected still gets a true
 * count, and `liked: false` meaning "not you" rather than "unknown".
 */
export async function likeState(
  coinMint: string,
  cluster: string,
  wallet?: string | null,
): Promise<LikeState> {
  const collection = await likes();
  const [count, mine] = await Promise.all([
    collection.countDocuments({ coinMint, cluster }),
    wallet
      ? collection.countDocuments({ coinMint, cluster, wallet }, { limit: 1 })
      : Promise.resolve(0),
  ]);
  return { count, liked: mine > 0 };
}

/**
 * Toggle this wallet's like, and report the resulting state.
 *
 * Returns the count read after the write, so a caller never has to guess by
 * incrementing its own stale number.
 */
export async function toggleLike(input: {
  coinMint: string;
  cluster: string;
  wallet: string;
}): Promise<LikeState> {
  const { coinMint, cluster, wallet } = input;
  const collection = await likes();

  const removed = await collection.deleteOne({ coinMint, cluster, wallet });
  if (removed.deletedCount === 0) {
    try {
      await collection.insertOne({ coinMint, cluster, wallet, createdAt: new Date() });
    } catch (error) {
      // Duplicate key: another tab inserted between our delete and insert.
      // The wallet has liked it, which is the state we were heading for.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  return likeState(coinMint, cluster, wallet);
}

/** Like counts for many coins at once, for list views. */
export async function likeCounts(
  coinMints: string[],
  cluster: string,
): Promise<Record<string, number>> {
  if (coinMints.length === 0) return {};
  const rows = await (await likes())
    .aggregate<{ _id: string; n: number }>([
      { $match: { cluster, coinMint: { $in: coinMints } } },
      { $group: { _id: "$coinMint", n: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/* ------------------------------------------------------------------ */
/* Follows                                                             */
/* ------------------------------------------------------------------ */

/**
 * A follow, keyed on (followerWallet, creatorWallet).
 *
 * Same shape as a like and for the same reason: the unique index is what makes
 * following twice a no-op. No cluster here — a creator is a wallet, and a
 * wallet is the same person whichever cluster you met them on.
 */
type FollowDoc = {
  followerWallet: string;
  creatorWallet: string;
  createdAt: Date;
};

async function follows(): Promise<Collection<FollowDoc>> {
  const collection = (await db()).collection<FollowDoc>("follows");
  await collection
    .createIndex({ followerWallet: 1, creatorWallet: 1 }, { unique: true })
    .catch(() => undefined);
  await collection.createIndex({ creatorWallet: 1 }).catch(() => undefined);
  return collection;
}

export type FollowState = {
  /** How many wallets follow this creator. */
  followers: number;
  /** How many this creator follows. */
  following: number;
  /** Whether the viewer follows them. False when no wallet is connected. */
  following_them: boolean;
};

export async function followState(
  creatorWallet: string,
  viewerWallet?: string | null,
): Promise<FollowState> {
  const collection = await follows();
  const [followers, following, mine] = await Promise.all([
    collection.countDocuments({ creatorWallet }),
    collection.countDocuments({ followerWallet: creatorWallet }),
    viewerWallet
      ? collection.countDocuments(
          { followerWallet: viewerWallet, creatorWallet },
          { limit: 1 },
        )
      : Promise.resolve(0),
  ]);
  return { followers, following, following_them: mine > 0 };
}

export async function toggleFollow(input: {
  followerWallet: string;
  creatorWallet: string;
}): Promise<FollowState> {
  const { followerWallet, creatorWallet } = input;
  if (followerWallet === creatorWallet) {
    throw new Error("A wallet cannot follow itself");
  }

  const collection = await follows();
  const removed = await collection.deleteOne({ followerWallet, creatorWallet });
  if (removed.deletedCount === 0) {
    try {
      await collection.insertOne({ followerWallet, creatorWallet, createdAt: new Date() });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  return followState(creatorWallet, followerWallet);
}
