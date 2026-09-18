import { getConnection } from "./dbc";
import type { NavReading } from "./nav";
import {
  PYTH_RECEIVER_PROGRAM,
  PYTH_SHARDS,
  decodePriceUpdateV2,
  priceFeedAccount,
  scaled,
  type PriceUpdate,
} from "./pyth-account";

/**
 * Pyth price feeds.
 *
 * Two jobs. First, quoting a SOL-denominated pool in dollars honestly — market
 * caps in SOL terms are not comparable across pools. Second, the NAV band:
 * an equity-preset launch is supposed to track an underlying, and a bonding
 * curve has no idea what the underlying costs. Pyth is what closes that loop,
 * which is why `navBandBps` exists on the equity presets.
 *
 * Read on-chain first: Pyth's sponsored price accounts on Solana are ordinary
 * accounts on the cluster the app already talks to, so they need no key.
 * Hermes is a fallback only when `PYTH_API_KEY` is set — its price endpoints
 * answer 401 without one.
 *
 * No `server-only` marker, for the same reason `dbc.ts` has none: its only
 * dependency is an RPC `Connection`, so `scripts/juno-pyth.ts` can import it
 * under tsx. `PYTH_API_KEY` has no `NEXT_PUBLIC_` prefix and is never bundled.
 */

const HERMES = "https://hermes.pyth.network";

/**
 * Feed ids, verified against Hermes `/v2/price_feeds` on 2026-09-18. The
 * TSLA, MSFT and AMZN ids this table used to carry were wrong — the "MSFT"
 * one was in fact BTC/USD — so a pool launched against them would have been
 * banded against the wrong asset.
 */
export const PYTH_FEEDS = {
  "Crypto.SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "Crypto.USDC/USD": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "Crypto.USDT/USD": "2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Equity.US.NVDA/USD": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  "Equity.US.TSLA/USD": "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  "Equity.US.MSFT/USD": "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  "Equity.US.AMZN/USD": "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
} as const;

export type PythFeedName = keyof typeof PYTH_FEEDS;

/**
 * How old a price may be and still be shown as a price. Sponsored feeds are
 * pushed on a heartbeat (one minute by default on mainnet) or a deviation
 * trigger, whichever is first. Devnet's runs slower: SOL/USD was measured
 * publishing every 313–315 s on 2026-09-18, so the default is about twice that.
 * Past this, the UI says "stale" rather than printing a number that may be
 * minutes or months out of date.
 */
export const MAX_PRICE_AGE_SECONDS = Number(process.env.PYTH_MAX_AGE_SECONDS) || 600;

export function feedIdFor(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name in PYTH_FEEDS) return PYTH_FEEDS[name as PythFeedName];
  // Already an id.
  const id = name.replace(/^0x/, "");
  return /^[0-9a-f]{64}$/i.test(id) ? id.toLowerCase() : null;
}

/**
 * Pick the freshest valid update among the accounts read for one feed.
 * Exported for tests. `accounts` pairs each address with its raw data and
 * owner; anything not owned by the Receiver, not a `PriceUpdateV2`, for a
 * different feed, or short of a full guardian quorum is ignored.
 */
export function freshestUpdate(
  feedId: string,
  accounts: Array<{ address: string; owner: string; data: Uint8Array } | null>,
): { update: PriceUpdate; address: string } | null {
  let best: { update: PriceUpdate; address: string } | null = null;
  for (const account of accounts) {
    if (!account || account.owner !== PYTH_RECEIVER_PROGRAM) continue;
    const update = decodePriceUpdateV2(account.data);
    if (!update || update.feedId !== feedId) continue;
    if (update.verification.level !== "full") continue;
    if (!best || update.publishTime > best.update.publishTime) {
      best = { update, address: account.address };
    }
  }
  return best;
}

/** Turn a decoded update into what the UI may see, given the clock. */
export function toReading(
  feedId: string,
  found: { update: PriceUpdate; address: string } | null,
  nowSeconds: number,
  maxAgeSeconds = MAX_PRICE_AGE_SECONDS,
): NavReading {
  if (!found) {
    return { status: "unavailable", feedId, reason: "No Pyth price account for this feed on this cluster" };
  }
  const { update, address } = found;
  const publishedAt = new Date(update.publishTime * 1000).toISOString();
  const price = scaled(update.price, update.exponent);
  if (nowSeconds - update.publishTime > maxAgeSeconds || !(price > 0)) {
    return { status: "stale", feedId, publishedAt, account: address, source: "solana" };
  }
  return {
    status: "live",
    feedId,
    priceUsd: price,
    confidence: scaled(update.conf, update.exponent),
    publishedAt,
    account: address,
    source: "solana",
  };
}

async function readOnChain(feedIds: string[]): Promise<Record<string, NavReading>> {
  const addresses = feedIds.flatMap((id) => PYTH_SHARDS.map((shard) => priceFeedAccount(id, shard)));
  const out: Record<string, NavReading> = {};
  let infos;
  try {
    infos = await getConnection().getMultipleAccountsInfo(addresses);
  } catch {
    for (const id of feedIds) {
      out[id] = { status: "unavailable", feedId: id, reason: RPC_FAILED };
    }
    return out;
  }
  const now = Math.floor(Date.now() / 1000);
  feedIds.forEach((id, i) => {
    const accounts = PYTH_SHARDS.map((_, s) => {
      const info = infos[i * PYTH_SHARDS.length + s];
      const address = addresses[i * PYTH_SHARDS.length + s];
      return info ? { address: address.toBase58(), owner: info.owner.toBase58(), data: info.data } : null;
    });
    out[id] = toReading(id, freshestUpdate(id, accounts), now);
  });
  return out;
}

async function readHermes(feedIds: string[]): Promise<Record<string, NavReading>> {
  const key = process.env.PYTH_API_KEY;
  if (!key || feedIds.length === 0) return {};
  const params = feedIds.map((id) => `ids[]=${id}`).join("&");
  const response = await fetch(`${HERMES}/v2/updates/price/latest?${params}&parsed=true`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 10 },
  }).catch(() => null);
  if (!response?.ok) return {};

  const body = (await response.json()) as {
    parsed?: Array<{
      id: string;
      price: { price: string; conf: string; expo: number; publish_time: number };
    }>;
  };
  const now = Math.floor(Date.now() / 1000);
  const out: Record<string, NavReading> = {};
  for (const entry of body.parsed ?? []) {
    const scale = 10 ** entry.price.expo;
    const publishedAt = new Date(entry.price.publish_time * 1000).toISOString();
    const price = Number(entry.price.price) * scale;
    out[entry.id] =
      now - entry.price.publish_time > MAX_PRICE_AGE_SECONDS || !(price > 0)
        ? { status: "stale", feedId: entry.id, publishedAt, account: null, source: "hermes" }
        : {
            status: "live",
            feedId: entry.id,
            priceUsd: price,
            confidence: Number(entry.price.conf) * scale,
            publishedAt,
            account: null,
            source: "hermes",
          };
  }
  return out;
}

/*
 * A grid of pools asks for SOL/USD once per tile, and every coin page asks for
 * its NAV feed — all against a public RPC that answers bursts with 429s.
 * In-flight reads are shared, and results are held for as long as they can
 * usefully be: a live price for 15 s (devnet publishes every ~5 min, and the
 * UI shows the publish time, not the read time), a feed that has not moved
 * since July for a minute, and a failed read only briefly so it is retried.
 */
const CACHE_MS = { live: 15_000, settled: 60_000, failed: 5_000 };
const RPC_FAILED = "Solana RPC read failed";
const READ_FAILED = "Price read failed";
const cache = new Map<string, { at: number; ttl: number; reading: Promise<NavReading> }>();

/** Exported for tests. */
export function ttlFor(reading: NavReading): number {
  if (reading.status === "live") return CACHE_MS.live;
  if (reading.status === "unavailable" && (reading.reason === RPC_FAILED || reading.reason === READ_FAILED)) {
    return CACHE_MS.failed;
  }
  return CACHE_MS.settled;
}

async function readUncached(feedIds: string[]): Promise<Record<string, NavReading>> {
  const onChain = await readOnChain(feedIds);
  const notLive = feedIds.filter((id) => onChain[id]?.status !== "live");
  if (notLive.length === 0) return onChain;
  // Hermes, where a key allows it, for whatever the chain could not answer.
  const hermes = await readHermes(notLive);
  for (const id of notLive) {
    if (hermes[id]?.status === "live") onChain[id] = hermes[id];
  }
  return onChain;
}

/**
 * Readings for several feeds, keyed by feed id. Every requested id gets an
 * entry — `live`, `stale`, or `unavailable` with a reason — never a
 * defaulted number.
 */
export async function readPythFeeds(feedIds: string[]): Promise<Record<string, NavReading>> {
  const ids = [...new Set(feedIds.map((id) => id.toLowerCase()))];
  const now = Date.now();
  const missing = ids.filter((id) => {
    const hit = cache.get(id);
    return !hit || now - hit.at > hit.ttl;
  });
  if (missing.length > 0) {
    const batch = readUncached(missing);
    for (const id of missing) {
      // Held for the shortest window until the read lands, so a request that
      // arrives mid-flight shares it rather than starting another.
      const reading = batch.then(
        (r) => r[id],
        (): NavReading => ({ status: "unavailable", feedId: id, reason: READ_FAILED }),
      );
      const entry = { at: now, ttl: CACHE_MS.failed, reading };
      void reading.then((r) => {
        entry.ttl = ttlFor(r);
      });
      cache.set(id, entry);
    }
  }
  const entries = await Promise.all(ids.map(async (id) => [id, await cache.get(id)!.reading] as const));
  return Object.fromEntries(entries);
}

export async function readPythFeed(feedId: string): Promise<NavReading> {
  const id = feedId.toLowerCase();
  return (await readPythFeeds([id]))[id];
}

/**
 * USD value of one unit of a pool's quote token, or null when unknowable.
 *
 * Stablecoins are taken at their peg. SOL needs a live feed, and null is the
 * honest answer without one — a pool denominated in SOL is better shown in
 * SOL than at an invented or stale dollar rate.
 */
export async function quoteTokenUsdPrice(quoteMint: string): Promise<number | null> {
  if (quoteMint !== WSOL_MINT) return 1; // USDC and other stables
  const sol = await readPythFeed(PYTH_FEEDS["Crypto.SOL/USD"]).catch(() => null);
  return sol?.status === "live" ? sol.priceUsd : null;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

