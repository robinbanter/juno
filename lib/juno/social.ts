import "server-only";

import { MongoClient, type Collection, type Db } from "mongodb";

/**
 * Social state: comments and likes.
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

/**
 * Notes attached to specific trades, keyed by signature.
 *
 * The feed shows fills decoded from the chain; a note is something the trader
 * chose to say about one. Joining them here rather than in the feed's walk
 * keeps it one query for the whole page instead of one per row, and keeps the
 * chain read independent of whether Mongo is up — a comments outage costs the
 * notes, not the feed.
 *
 * Signatures are unique, so the last write for one wins; in practice a trade
 * gets at most one note because only the sheet that signed it can attach one.
 */
export async function notesForSignatures(
  signatures: string[],
  cluster: string,
): Promise<Map<string, JunoComment>> {
  if (signatures.length === 0) return new Map();
  const docs = await (await comments())
    .find({ cluster, signature: { $in: signatures } })
    .sort({ createdAt: 1 })
    .toArray();

  return new Map(
    docs.map((doc) => [
      doc.signature!,
      {
        id: doc._id.toString(),
        coinMint: doc.coinMint,
        wallet: doc.wallet,
        body: doc.body,
        side: doc.side,
        signature: doc.signature,
        createdAt: doc.createdAt.toISOString(),
      },
    ]),
  );
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
