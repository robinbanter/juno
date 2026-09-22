import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { junoPools } from "@/lib/db/schema";
import { cluster } from "./cluster";
import type { CoinFormat, CurvePresetId } from "./types";

/**
 * The index of pools Juno launched.
 *
 * Identity and provenance only. Every number that moves — price, reserves,
 * curve progress, graduation — is read from the DBC program at request time,
 * because a cached copy of a live market is a cache that is always wrong.
 */

export type JunoPoolRow = typeof junoPools.$inferSelect;

export type LaunchRecord = {
  baseMint: string;
  poolAddress: string;
  configAddress: string;
  quoteMint: string;
  creatorWallet: string;
  name: string;
  symbol: string;
  description?: string | null;
  format: CoinFormat;
  curvePreset: CurvePresetId;
  mediaUrl?: string | null;
  posterUrl?: string | null;
  /** Decides image or video everywhere downstream — see `mediaKind`. */
  mediaMime?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  navFeedId?: string | null;
  /** Units of the reference one token stands for — see the schema comment. */
  navUnitsPerToken?: number | null;
  createSignature: string;
};

export async function recordLaunch(row: LaunchRecord): Promise<JunoPoolRow> {
  const db = getDb();
  const [inserted] = await db
    .insert(junoPools)
    .values({ ...row, cluster: cluster() })
    // A retried request re-sends the same mint. The chain has already accepted
    // the launch by then, so keep the first row rather than failing.
    .onConflictDoNothing({ target: junoPools.baseMint })
    .returning();

  if (inserted) return inserted;
  const existing = await getPool(row.baseMint);
  if (!existing) throw new Error(`Failed to record pool ${row.baseMint}`);
  return existing;
}

/** Newest first, scoped to the current cluster. */
export async function listPools(limit = 60): Promise<JunoPoolRow[]> {
  return getDb()
    .select()
    .from(junoPools)
    .where(eq(junoPools.cluster, cluster()))
    .orderBy(desc(junoPools.createdAt))
    .limit(limit);
}

export async function listPoolsByCreator(wallet: string): Promise<JunoPoolRow[]> {
  return getDb()
    .select()
    .from(junoPools)
    .where(and(eq(junoPools.cluster, cluster()), eq(junoPools.creatorWallet, wallet)))
    .orderBy(desc(junoPools.createdAt));
}

export async function getPool(baseMint: string): Promise<JunoPoolRow | null> {
  const [row] = await getDb()
    .select()
    .from(junoPools)
    .where(eq(junoPools.baseMint, baseMint))
    .limit(1);
  return row ?? null;
}
