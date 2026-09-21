import { Connection, PublicKey } from "@solana/web3.js";

import { tryRead, ttlCache } from "./rpc";

/**
 * Pyth price feeds, read on-chain.
 *
 * Two jobs. First, quoting a SOL-denominated pool in dollars honestly — market
 * caps in SOL terms are not comparable across pools. Second, the NAV band: an
 * equity-preset launch is supposed to track an underlying, and a bonding curve
 * has no idea what the underlying costs. Pyth is what closes that loop, which
 * is why `navBandBps` exists on the equity presets.
 *
 * ## Why not Hermes
 *
 * The obvious client is Hermes, Pyth's HTTP price service. It now requires an
 * API key: `GET /v2/updates/price/latest` answers **401** without one, on both
 * `hermes.pyth.network` and `hermes-beta.pyth.network`, and so does the older
 * `/api/latest_price_feeds`. There is no key in this repo and a price invented
 * to fill the gap would be worse than no price, so an earlier version of this
 * module returned nothing at all and the NAV band was shelved.
 *
 * That was the wrong conclusion. Pyth's prices are **already on Solana**. The
 * push oracle maintains a `PriceUpdateV2` account per feed, and reading one
 * costs a single `getAccountInfo` against the same RPC the rest of the app
 * uses — no key, no HTTP service, no new dependency. For a Solana app this is
 * also the more honest integration: the price the UI shows is the price a
 * Solana program would see.
 *
 * ## Two things the account layout forces
 *
 * **Shards.** Each feed is published into several PDAs, one per shard id, and
 * they are *not* equally fresh. Measured against mainnet: SOL/USD and USDC/USD
 * are current on shard 0 while the equities are current on shard 1, and the
 * other shard of each lags by days or months. So the right account cannot be
 * hardcoded per feed — both are read and the newer `publishTime` wins.
 *
 * **Market hours.** An equity feed stops updating when the exchange closes, so
 * on a Sunday AAPL is legitimately hours old. That is Friday's close, not a
 * broken read, and the two must not be conflated: a staleness rule tight enough
 * for SOL would throw away every equity mark at the weekend. `PythPrice`
 * therefore reports age and lets the caller decide, and the UI labels a closed
 * market as a last close rather than implying it is live.
 *
 * Feeds are read from **mainnet** regardless of which cluster Juno is pointed
 * at, because the push oracle does not publish to devnet. A devnet pool priced
 * against a real mainnet mark is the intended behaviour: the alternative is no
 * mark at all.
 */

/**
 * Two programs, and they are not interchangeable.
 *
 * The price accounts are PDAs *of the push oracle*, so that is the program id
 * the address is derived from. But the accounts are *owned by* the receiver,
 * which is the program that writes the verified price into them. Checking the
 * owner against the push oracle rejects every real account — which is exactly
 * the bug this comment exists to prevent recurring.
 */
const PUSH_ORACLE_PROGRAM = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const RECEIVER_PROGRAM = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/**
 * Where the feeds are published. Fixed to mainnet on purpose — see the note
 * above. Overridable so a fork or a private endpoint can serve them instead.
 */
function oracleEndpoint(): string {
  return (
    process.env.PYTH_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_PYTH_RPC_URL?.trim() ||
    "https://api.mainnet-beta.solana.com"
  );
}

let oracleConnection: Connection | null = null;

function getOracleConnection(): Connection {
  oracleConnection ??= new Connection(oracleEndpoint(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  return oracleConnection;
}

/**
 * Feed ids, verified against Hermes `/v2/price_feeds` — which needs no key, so
 * the catalogue is checkable even though the prices are not.
 *
 * Equities are the ones the curve presets care about. Crypto is here because a
 * SOL-quoted pool cannot be priced in dollars without SOL/USD.
 */
export const PYTH_FEEDS = {
  "Crypto.SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "Crypto.USDC/USD": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "Equity.US.AAPL/USD": "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "Equity.US.NVDA/USD": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  "Equity.US.TSLA/USD": "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  "Equity.US.MSFT/USD": "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  "Equity.US.GOOGL/USD": "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
  "Equity.US.AMZN/USD": "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  "Equity.US.META/USD": "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
} as const;

export type PythFeedName = keyof typeof PYTH_FEEDS;

export type PythPrice = {
  /** The 32-byte feed id, hex, no prefix. */
  feed: string;
  priceUsd: number;
  /** Pyth's own confidence interval, in dollars. */
  confidence: number;
  publishedAt: string;
  /** Seconds since the publisher last moved this feed. */
  ageSeconds: number;
  /** Which shard's account this came from. */
  shard: number;
};

export function feedIdFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed in PYTH_FEEDS) return PYTH_FEEDS[trimmed as PythFeedName];
  const bare = trimmed.replace(/^0x/, "");
  return /^[0-9a-f]{64}$/i.test(bare) ? bare.toLowerCase() : null;
}

/** Human label for a feed id, when we happen to know one. */
export function feedNameFor(feedId: string): string | null {
  const normalised = feedId.replace(/^0x/, "").toLowerCase();
  for (const [name, id] of Object.entries(PYTH_FEEDS)) {
    if (id === normalised) return name;
  }
  return null;
}

/** True for a feed that only trades during exchange hours. */
export function isEquityFeed(feedId: string): boolean {
  return feedNameFor(feedId)?.startsWith("Equity.") ?? false;
}

/**
 * The `PriceUpdateV2` account for one shard of a feed.
 *
 * Seeds are the shard id as a little-endian u16 followed by the raw feed id.
 */
export function priceAccountFor(feedId: string, shard: number): PublicKey {
  const shardSeed = Buffer.alloc(2);
  shardSeed.writeUInt16LE(shard);
  const id = Buffer.from(feedId.replace(/^0x/, ""), "hex");
  return PublicKey.findProgramAddressSync([shardSeed, id], PUSH_ORACLE_PROGRAM)[0];
}

/**
 * Decode a `PriceUpdateV2` account.
 *
 * Layout: an 8-byte Anchor discriminator, a 32-byte write authority, a
 * `VerificationLevel` enum, then the price message. The enum is the one awkward
 * part — `Partial` carries a `u8` of signature count and `Full` carries
 * nothing, so the message's offset depends on which variant it is.
 *
 * Returns null rather than throwing on anything unexpected: a truncated or
 * reallocated account must not take down a page that only wanted a reference
 * price.
 */
export function decodePriceAccount(data: Buffer, shard: number): PythPrice | null {
  try {
    let offset = 8 + 32;
    if (data.length < offset + 1) return null;

    const verification = data.readUInt8(offset);
    offset += 1;
    // Variant 0 is Partial { num_signatures: u8 }; 1 is Full.
    if (verification === 0) offset += 1;

    if (data.length < offset + 32 + 8 + 8 + 4 + 8) return null;

    const feed = data.subarray(offset, offset + 32).toString("hex");
    offset += 32;
    const price = data.readBigInt64LE(offset);
    offset += 8;
    const confidence = data.readBigUInt64LE(offset);
    offset += 8;
    const exponent = data.readInt32LE(offset);
    offset += 4;
    const publishTime = Number(data.readBigInt64LE(offset));

    // Pyth exponents are small and negative. Anything else means this is not
    // the account we think it is.
    if (exponent > 0 || exponent < -18) return null;
    if (publishTime <= 0) return null;

    const scale = 10 ** exponent;
    const priceUsd = Number(price) * scale;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

    return {
      feed,
      priceUsd,
      confidence: Number(confidence) * scale,
      publishedAt: new Date(publishTime * 1000).toISOString(),
      ageSeconds: Math.max(0, Math.round(Date.now() / 1000 - publishTime)),
      shard,
    };
  } catch {
    return null;
  }
}

/**
 * Shards to consider. Zero carries crypto, one carries equities; reading both
 * and taking the fresher is cheaper than maintaining a per-feed table that goes
 * stale the moment Pyth re-shards.
 */
const SHARDS = [0, 1] as const;

/** Prices move; a minute of staleness costs nothing and saves the rate limit. */
const PRICE_TTL_MS = 60_000;
const priceCache = ttlCache<PythPrice | null>(PRICE_TTL_MS);

/**
 * The freshest published price for a feed, or null when none can be read.
 *
 * Null is a real answer and the callers treat it as one: a market cap stays
 * denominated in its own quote token, and a NAV band is not drawn.
 */
export async function fetchPythPrice(feedId: string | null): Promise<PythPrice | null> {
  const id = feedIdFor(feedId);
  if (!id) return null;

  const cached = await priceCache.get(id, async () => {
    const accounts = SHARDS.map((shard) => ({ shard, address: priceAccountFor(id, shard) }));

    // One multi-account read rather than one per shard.
    const infos = await tryRead(() =>
      getOracleConnection().getMultipleAccountsInfo(accounts.map((a) => a.address)),
    );
    if (!infos) return null;

    let best: PythPrice | null = null;
    for (const [index, info] of infos.entries()) {
      if (!info?.data) continue;
      // Owned by the receiver, derived from the push oracle. See above.
      if (!info.owner.equals(RECEIVER_PROGRAM)) continue;

      const decoded = decodePriceAccount(Buffer.from(info.data), accounts[index].shard);
      if (!decoded) continue;
      // The account is a PDA of the feed id, but check anyway — a mismatch
      // would mean pricing one asset off another.
      if (decoded.feed !== id) continue;
      if (!best || decoded.ageSeconds < best.ageSeconds) best = decoded;
    }
    return best;
  });

  return aged(cached);
}

/**
 * Recompute how old the mark is, now.
 *
 * `ageSeconds` was decoded once and cached alongside the price, so a cached
 * reading reported the age it had when it was *fetched*. Two reads twenty
 * seconds apart both said "15s", and the coin page printed "Pyth mark from
 * 15s" over a figure that could be a whole TTL older. For a product whose
 * claim is that live market data does real work, a freshness label that
 * freezes is the one number that must not.
 *
 * `publishedAt` is the publisher's own timestamp and does not change, so age
 * is derived from it at read time and `isFresh`/`marketState` follow.
 */
function aged(price: PythPrice | null): PythPrice | null {
  if (!price) return null;
  const published = Date.parse(price.publishedAt);
  if (!Number.isFinite(published)) return price;
  return {
    ...price,
    ageSeconds: Math.max(0, Math.round((Date.now() - published) / 1000)),
  };
}

/** Several feeds at once, keyed by feed id. Absent means unreadable. */
export async function fetchPythPrices(
  feedIds: Array<string | null>,
): Promise<Record<string, PythPrice>> {
  const ids = [...new Set(feedIds.map(feedIdFor).filter((id): id is string => Boolean(id)))];
  const out: Record<string, PythPrice> = {};
  // Sequential: these are cached, and a burst is what gets an endpoint to
  // start refusing.
  for (const id of ids) {
    const price = await fetchPythPrice(id);
    if (price) out[id] = price;
  }
  return out;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * USD value of one unit of a pool's quote token, or null when unknowable.
 *
 * Stablecoins are 1 by definition — quoting USDC off its own feed would make a
 * pool's market cap wobble by a few basis points for no gain. SOL needs the
 * feed, and null is the honest answer when it cannot be read: a pool
 * denominated in SOL is better shown in SOL than at an invented dollar rate.
 */
export async function quoteTokenUsdPrice(quoteMint: string): Promise<number | null> {
  if (quoteMint !== WSOL_MINT) return 1;
  const sol = await fetchPythPrice(PYTH_FEEDS["Crypto.SOL/USD"]);
  return sol?.priceUsd ?? null;
}

/* ------------------------------------------------------------------ */
/* NAV band                                                           */
/* ------------------------------------------------------------------ */

/**
 * How stale a mark may be before it is called stale.
 *
 * Crypto trades continuously, so a minute is generous. Equities stop overnight
 * and at weekends, so the only useful threshold is one that distinguishes "the
 * exchange is closed" from "the publisher has gone away" — four days clears a
 * long weekend and still catches a genuinely dead feed.
 */
const FRESH_CRYPTO_SECONDS = 120;
const FRESH_EQUITY_SECONDS = 4 * 24 * 60 * 60;

export function isFresh(price: PythPrice): boolean {
  const limit = isEquityFeed(price.feed) ? FRESH_EQUITY_SECONDS : FRESH_CRYPTO_SECONDS;
  return price.ageSeconds <= limit;
}

/**
 * Whether this mark is live or a last close.
 *
 * Derived from age rather than from a trading calendar: a calendar in the repo
 * would have to know every exchange holiday to be right, and the publisher
 * already tells us when it last spoke.
 */
export function marketState(price: PythPrice): "live" | "closed" | "stale" {
  if (!isFresh(price)) return "stale";
  if (!isEquityFeed(price.feed)) return "live";
  return price.ageSeconds <= FRESH_CRYPTO_SECONDS ? "live" : "closed";
}

/**
 * Where the curve sits against the underlying.
 *
 * `deviation` is signed: positive means the curve is trading above the
 * reference mark. `withinBand` compares it to the preset's own tolerance.
 */
export function navBand(params: {
  curvePriceUsd: number;
  navPriceUsd: number;
  bandBps: number;
}): { deviation: number; withinBand: boolean } {
  const { curvePriceUsd, navPriceUsd, bandBps } = params;
  if (navPriceUsd <= 0) return { deviation: 0, withinBand: true };
  const deviation = (curvePriceUsd - navPriceUsd) / navPriceUsd;
  return { deviation, withinBand: Math.abs(deviation) * 10_000 <= bandBps };
}
