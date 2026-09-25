import "server-only";

import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";

import {
  getConnection,
  getDbcClient,
  bnToUi,
  fetchPoolSnapshot,
  prefetchPools,
  vaultsOf,
} from "./dbc";
import {
  fetchPythPrice,
  marketState as marketStateOf,
  navBand,
  quoteTokenUsdPrice,
} from "./pyth";
import { curveShape } from "./curve-shape";
import { CURVE_PRESETS } from "./curves";
import { feeSchedule, tokenomics } from "./economics";
import { identicon } from "./identicon";
import { activityFromSwap } from "./activity";
import { mediaKind, mediaSrc } from "./media";
import { isTesseraRef, tesseraOnChain, tesseraToken, TESSERA_PREFIX } from "./tessera";
import { tryRead, ttlCache } from "./rpc";
import {
  changeWithin,
  listSwapHistory,
  priceSeries,
  totalVolume as sumVolume,
  volumeWithin,
  DAY_MS,
  type PoolSwap,
} from "./swaps";
import type { JunoPoolRow } from "./registry";
import type {
  Activity,
  Coin,
  CoinFormat,
  CurvePresetId,
  Creator,
  NavReference,
  QuoteToken,
} from "./types";
import { shortAddress } from "./format";

/**
 * Turns a registry row plus live chain state into the `Coin` the UI renders.
 *
 * Split of responsibility: the row supplies identity (who launched it, what
 * they called it, which preset), the chain supplies every number. Nothing
 * numeric is stored or cached.
 */

/** The live sqrt price, reached through the pool account's inner state. */
function poolSqrtPrice(snapshot: { pool: unknown }): BN {
  return (snapshot.pool as { poolState: { sqrtPrice: BN } }).poolState.sqrtPrice;
}

/** Total supply every Juno preset mints. Mirrors `DEFAULT_TOTAL_SUPPLY`. */
const TOTAL_SUPPLY = 1_000_000_000;

function creatorFromWallet(wallet: string): Creator {
  return {
    handle: shortAddress(wallet, 4, 4),
    displayName: shortAddress(wallet, 4, 4),
    avatarUrl: identicon(wallet),
    ticker: shortAddress(wallet, 4, 4),
    wallet,
    followers: null,
    following: null,
    posts: 0,
    marketCap: 0,
    marketCapCurrency: "USD",
    // A wallet is not a profile. There is no creator-coin market here to have a
    // change, so null rather than a 0% that would render as a real reading.
    marketCapChangePct: null,
  };
}

/**
 * Where the underlying is marked, for a pool that names a reference.
 *
 * Only equity-shaped presets carry a `navBandBps`, and only pools launched in
 * issuance mode carry a reference, so most coins have no NAV and that is
 * correct rather than missing — a photo has no net asset value.
 *
 * Two sources, chosen by the reference itself. Pyth for anything listed;
 * Tessera for the pre-IPO names Pyth has no feed for, which is the entire
 * reason the second path exists — there is no oracle for a company that has
 * not floated, and a `tight-nav` curve about SpaceX needs something to be
 * tight *against*.
 */
async function navFor(
  row: JunoPoolRow,
  priceUsd: number,
  preset: CurvePresetId,
): Promise<NavReference | null> {
  if (!row.navFeedId) return null;
  const bandBps = CURVE_PRESETS[preset]?.navBandBps;
  if (!bandBps) return null;

  /*
   * The curve's price, restated in the reference's own units.
   *
   * `navUnitsPerToken` is how much of the underlying one token stands for. A
   * curve token costs a hundredth of a cent and a share of NVDA costs $224, so
   * without this conversion the band was subtracting two numbers that are not
   * the same kind of thing and reporting every tracker as "-100%, outside the
   * band" — arithmetically true and completely meaningless.
   *
   * Null when the pool never recorded a ratio, and null is the answer: the
   * deviation is genuinely unknown rather than zero.
   */
  const ratio = row.navUnitsPerToken;
  const band = (navPriceUsd: number) => {
    if (ratio === null || !(ratio > 0)) {
      return { deviation: null, withinBand: null, impliedUsd: null };
    }
    const impliedUsd = priceUsd / ratio;
    const { deviation } = navBand({ curvePriceUsd: impliedUsd, navPriceUsd, bandBps });
    return {
      deviation,
      withinBand: Math.abs(deviation) * 10_000 <= bandBps,
      impliedUsd,
    };
  };

  if (isTesseraRef(row.navFeedId)) {
    const token = await tesseraToken(row.navFeedId).catch(() => null);
    if (!token) return null;

    // Read alongside the mark so the disclosure on the coin page is a fact
    // about the mint today, not a sentence copied out of a whitepaper.
    const facts = await tesseraOnChain(token.mint).catch(() => null);
    const { deviation, withinBand, impliedUsd } = band(token.markPrice);

    return {
      feed: token.id,
      priceUsd: token.markPrice,
      deviation,
      bandBps,
      withinBand,
      impliedUsd,
      unitsPerToken: ratio,
      /*
       * When *we* read it, and labelled as such by `state: "mark"`.
       *
       * Tessera publishes a price and no timestamp. Putting their mark in the
       * `updatedAt` slot with a made-up time would be the one number on this
       * screen that came from nowhere; `ageSeconds: null` is the honest shape.
       */
      updatedAt: new Date().toISOString(),
      ageSeconds: null,
      state: "mark",
      source: "tessera",
      tessera: {
        id: token.id,
        mint: token.mint,
        sector: token.sector,
        holders: token.holders,
        markValuation: token.markValuation,
        supply: token.supply,
        blocked: facts?.blocked ?? null,
      },
    };
  }

  const price = await fetchPythPrice(row.navFeedId);
  if (!price) return null;

  const { deviation, withinBand, impliedUsd } = band(price.priceUsd);

  return {
    feed: row.navFeedId,
    priceUsd: price.priceUsd,
    deviation,
    updatedAt: price.publishedAt,
    bandBps,
    withinBand,
    impliedUsd,
    unitsPerToken: ratio,
    state: marketStateOf(price),
    ageSeconds: price.ageSeconds,
    source: "pyth",
    tessera: null,
  };
}

function quoteFromRow(row: JunoPoolRow, decimals: number): QuoteToken {
  const symbol =
    row.quoteMint === "So11111111111111111111111111111111111111112" ? "SOL" : "USDC";
  return { mint: row.quoteMint, symbol, decimals };
}

/**
 * Hydrate one pool. Returns null when the pool is not on-chain — which happens
 * if a row was recorded against a different cluster.
 */
export async function hydratePool(
  row: JunoPoolRow,
  /**
   * Holder count and fee metrics cost two extra RPC calls per pool. A grid of
   * tiles shows neither, so list views skip them rather than burning the rate
   * limit on numbers nobody sees.
   */
  options: {
    detailed?: boolean;
    /**
     * Read trade history. Defaults to `detailed`.
     *
     * It is separable because it is by far the slowest read — a dozen paced
     * transaction fetches against an endpoint that throttles — while the price,
     * curve and NAV come back in under a second. The coin page renders without
     * it and streams the chart and activity in behind a Suspense boundary, so a
     * visitor sees a priced market immediately instead of a spinner.
     */
    history?: boolean;
    /**
     * Read the NAV reference without the rest of the detailed set.
     *
     * A list of stock trackers is pointless without the stock's price, and
     * the reference is one Pyth account read — nothing like the holder and
     * history walks `detailed` also pays for. It only costs anything on rows
     * that name a reference; a post has none and skips it.
     */
    nav?: boolean;
  } = {},
): Promise<Coin | null> {
  // Null means no USD feed. The pool is then reported in its own quote token
  // rather than converted at a rate nobody published.
  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);
  const rate = quoteUsd ?? 1;

  const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
  if (!snapshot) return null;

  const priceUsd = snapshot.price * rate;
  const client = getDbcClient();

  const preset = row.curvePreset as CurvePresetId;

  // The four detailed reads run together rather than in sequence. Each one is
  // independent of the others and each can sit in a retry backoff against a
  // throttled endpoint, so chaining them stacked those waits end to end — a
  // cold coin page took sixteen seconds, which is a page a judge closes.
  //
  // Holders and creator fees are both real reads. `getTokenLargestAccounts`
  // returns the top 20, which is a floor on the holder count rather than an
  // exact figure — enough to render, and honest about small markets.
  const wantHistory = options.history ?? options.detailed ?? false;

  /*
   * Every one of these is optional, and the whole group is wrapped as well as
   * each member.
   *
   * Per-promise `.catch` handles a read that rejects. It does not handle a
   * throw raised while the group is being *assembled* — `vaultsOf`, or the SDK
   * rejecting before the returned promise exists — and that path took the
   * entire coin page down on a busy endpoint, discarding a price, a curve and a
   * NAV band that had all been read successfully a moment earlier.
   *
   * The snapshot above is the only read this function cannot do without.
   */
  const [largest, fees, history, nav] = options.detailed
    ? await Promise.all([
        getConnection()
          .getTokenLargestAccounts(new PublicKey(row.baseMint))
          .catch(() => null),
        client.state.getPoolFeeMetrics(row.poolAddress).catch(() => null),
        wantHistory
          ? listSwapHistory(row.poolAddress, vaultsOf(snapshot)).catch(() => null)
          : null,
        navFor(row, priceUsd, preset).catch(() => null),
      ]).catch(() => [null, null, null, null] as const)
    : [null, null, null, options.nav ? await navFor(row, priceUsd, preset).catch(() => null) : null];

  // null, not 0: `largest` is null when the RPC refused, and "0 holders" is
  // a claim we would not have earned.
  const holders =
    largest === null
      ? null
      : largest.value.filter((account) => (account.uiAmount ?? 0) > 0).length;

  const creatorRewards = fees
    ? bnToUi(fees.current.creatorQuoteFee, snapshot.quoteDecimals) * rate
    : 0;

  // Media kind comes from the stored mime type, never from the URL's tail: an
  // IPFS address is a hash with no extension, so sniffing it classified every
  // video as an image and the reel feed rendered stills.
  const fallbackArt = identicon(row.baseMint);
  const media = {
    kind: mediaKind(row.mediaMime),
    url: mediaSrc(row.mediaUrl) ?? fallbackArt,
    posterUrl: mediaSrc(row.posterUrl) ?? mediaSrc(row.mediaUrl) ?? fallbackArt,
    width: row.mediaWidth ?? (row.format === "reel" ? 720 : 1000),
    height: row.mediaHeight ?? (row.format === "reel" ? 1280 : 1000),
  };

  // Trade history drives volume, the 24h change and the chart. One read feeds
  // all three, and it is skipped for list views that show none of them.
  const swaps = history?.swaps ?? [];
  // A partial read is short of the truth, so a total from it would understate
  // volume while looking authoritative. Null says "unknown" instead.
  const complete = history !== null && !history.partial;
  const volume24h = complete ? volumeWithin(swaps, DAY_MS) : null;
  const allVolume = complete ? sumVolume(swaps) : null;

  /*
   * What each trade did to the curve's price, with the trading fee taken out.
   *
   * A fill's price is read from the vaults, and on a buy the quote vault also
   * keeps the fee. On a fresh pool that fee is the 9% anti-sniper opening, so
   * the first buy looked 9% above the curve and the price after it read as a
   * fall: "-6.23%" and a red chart on a coin whose price had just risen. The
   * fee in force at each block is exact — it is this pool's own schedule —
   * so it is removed here. Volume and activity keep what was actually paid.
   */
  const activationPoint = Number(
    (snapshot.pool as { poolState: { activationPoint: BN } }).poolState.activationPoint.toString(),
  );
  const curveSwaps = swaps.map((swap) => {
    const at = Math.floor(Date.parse(swap.timestamp) / 1000);
    const bps =
      feeSchedule({ config: snapshot.config, activationPoint, nowSeconds: at })?.currentBps ?? 0;
    const kept = 1 - bps / 10_000;
    if (!(kept > 0)) return swap;
    return { ...swap, price: swap.side === "buy" ? swap.price * kept : swap.price / kept };
  });
  const opening = {
    price: curveShape({
      config: snapshot.config,
      baseDecimals: snapshot.baseDecimals,
      quoteDecimals: snapshot.quoteDecimals,
    }).startPrice,
    at: row.createdAt.getTime(),
  };
  const priceChange = complete
    ? changeWithin(curveSwaps, DAY_MS, snapshot.price, Date.now(), opening)
    : null;



  return {
    address: row.baseMint,
    format: row.format as CoinFormat,
    name: row.name,
    symbol: row.symbol,
    description: row.description ?? undefined,
    media,
    creator: creatorFromWallet(row.creatorWallet),
    createdAt: row.createdAt.toISOString(),
    pool: row.poolAddress,
    config: row.configAddress,
    quote: quoteFromRow(row, snapshot.quoteDecimals),
    quoteUsdRate: quoteUsd,
    marketCap: priceUsd * TOTAL_SUPPLY,
    marketCapCurrency: quoteUsd === null ? quoteFromRow(row, snapshot.quoteDecimals).symbol : "USD",
    // Market cap is price times a fixed supply, so its change is the price's.
    marketCapChangePct: priceChange,
    // Quote-denominated volume converted into whatever `marketCapCurrency`
    // says this coin is measured in, so the two figures agree.
    volume24h: volume24h === null ? null : volume24h * rate,
    totalVolume: allVolume === null ? null : allVolume * rate,
    priceHistory: history
      ? priceSeries(curveSwaps).map((point) => ({
          ...point,
          price: point.price * rate,
          volume: point.volume * rate,
        }))
      : undefined,
    priceHistoryPartial: history ? history.partial : undefined,
    nav,
    reference: row.navFeedId
      ? isTesseraRef(row.navFeedId)
        ? { source: "tessera", id: row.navFeedId.slice(TESSERA_PREFIX.length) }
        : { source: "pyth", id: row.navFeedId }
      : null,
    creatorRewards,
    holders,
    priceUsd,
    curve: snapshot.curve,
    curvePreset: preset,
    graduatedPool: snapshot.curve.graduated ? row.poolAddress : undefined,
    fee: options.detailed
      ? feeSchedule({ config: snapshot.config, activationPoint })
      : undefined,
    supply: options.detailed
      ? tokenomics(snapshot.config, snapshot.baseDecimals)
      : undefined,
    shape: options.detailed
      ? curveShape({
          config: snapshot.config,
          baseDecimals: snapshot.baseDecimals,
          quoteDecimals: snapshot.quoteDecimals,
          currentSqrtPrice: poolSqrtPrice(snapshot),
        })
      : undefined,
  };
}

/**
 * Recent trades against one pool, ready for the activity feed.
 *
 * Takes a registry row rather than vault addresses so no caller has to know how
 * a swap is decoded. The snapshot and the swap history are both cached, so the
 * coin page calling this after `hydratePool` costs no extra RPC.
 */
export async function poolActivity(row: JunoPoolRow, limit = 10): Promise<Activity[]> {
  return (await poolActivityRead(row, limit)).items;
}

/**
 * Recent trades, and whether the read was complete.
 *
 * Callers that render an *empty state* need the second half. An empty list from
 * a throttled endpoint and a pool nobody has traded look identical, and a coin
 * page was telling people "No trades yet" about a pool with four trades in it
 * because the history read came back short.
 */
export async function poolActivityRead(
  row: JunoPoolRow,
  limit = 10,
): Promise<{ items: Activity[]; partial: boolean }> {
  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);
  const rate = quoteUsd ?? 1;

  const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
  if (!snapshot) return { items: [], partial: true };

  const history = await listSwapHistory(row.poolAddress, vaultsOf(snapshot));
  return {
    items: history.swaps
      .slice(0, limit)
      .map((swap) => activityFromSwap(swap, rate)),
    partial: history.partial,
  };
}

/**
 * This pool's decoded fills, raw.
 *
 * `poolActivityRead` returns them shaped for a feed row, which loses the
 * signer's net position — the thing a holder book is built from. Both read the
 * same cached history, so asking for either after the other costs a cache
 * lookup rather than a walk.
 *
 * Null when the pool could not be read at all, which is different from a pool
 * with no trades and has to stay different all the way to the UI.
 */
export async function poolSwapsRead(row: JunoPoolRow): Promise<PoolSwap[] | null> {
  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);
  const snapshot = await fetchPoolSnapshot(row.poolAddress, quoteUsd ?? 1);
  if (!snapshot) return null;
  const history = await listSwapHistory(row.poolAddress, vaultsOf(snapshot));
  return history.swaps;
}

/** The merged feed moves only when someone trades. */
type FeedItem = Activity & { coinName: string; coinAddress: string };
type Feed = {
  items: FeedItem[];
  /**
   * The walk did not see every trade on the cluster.
   *
   * True when a pool's history was refused or cut short, or when the item cap
   * stopped the walk before the registry ran out. The page above says "every
   * trade against a Juno pool"; with this flag set, it is not entitled to.
   */
  partial: boolean;
};

const feedCache = ttlCache<Feed>(60_000);

/**
 * The global trade feed: recent trades across every pool, newest first.
 *
 * Reading this without an indexer means walking each pool's history, so the
 * shape of the work matters more than the code. Two constraints learned by
 * measuring it at 17 seconds:
 *
 * **Pools are walked a few at a time, not all at once.** `Promise.all` over
 * twenty pools fires twenty paced chunk-readers simultaneously, which is
 * precisely the burst the public endpoint answers with 429s — so the pacing
 * inside each reader is undone by the lack of pacing between them, and every
 * one of them then sits in a retry backoff.
 *
 * **Only the newest pools are walked.** A feed shows the last screenful of
 * trades; scanning every pool ever launched to fill it costs the same whether
 * the older ones have traded or not, and most have not.
 */
export async function globalActivity(
  rows: JunoPoolRow[],
  perPool = 10,
  width = 2,
  /**
   * Stop once this many items are in hand.
   *
   * Most pools have never traded, so walking all of them to fill one screen
   * spends the endpoint's patience on pools that will return nothing — and by
   * the time it reaches one that would have, it is being refused. Rows arrive
   * newest-first, which is also most-likely-to-have-traded-first.
   */
  enough = 40,
): Promise<Feed> {
  const key = rows.map((row) => row.baseMint).join(",");

  return feedCache.get(
    key,
    async () => {
    const out: FeedItem[] = [];
    let cursor = 0;
    let partial = false;

    async function worker() {
      while (cursor < rows.length && out.length < enough) {
        const row = rows[cursor++];
        // Both halves count as incomplete: a read that threw, and a read that
        // came back short. Either one means a trade may exist that this feed
        // is not showing.
        const read = await poolActivityRead(row, perPool).catch(() => null);
        if (read === null || read.partial) partial = true;
        for (const entry of read?.items ?? []) {
          out.push({ ...entry, coinName: row.name, coinAddress: row.baseMint });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(width, rows.length) }, worker));
    // Stopping at the cap also leaves pools unwalked.
    if (cursor < rows.length) partial = true;
    return {
      items: out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
      partial,
    };
  },
    // An empty feed is almost always a throttled read rather than a quiet
    // market, so it is trusted for seconds instead of a minute.
    (feed) => (feed.items.length > 0 ? 60_000 : 8_000),
  );
}

/**
 * Hydrate many for a list view, dropping any whose pool is missing here.
 *
 * Bounded concurrency rather than `Promise.all`: firing every pool read
 * simultaneously is the burst the public devnet RPC answers with 429s, and a
 * grid of four pools does not need to be four times as rude as one.
 *
 * `missing` is how many rows the registry had and this read could not resolve.
 * It is returned rather than swallowed because a list that quietly shrinks from
 * eleven to nine presents itself as the whole market: the caller has to be able
 * to say "two could not be read", and it cannot say that from a shorter array.
 */
export async function hydratePools(
  rows: JunoPoolRow[],
  width = 2,
  options: { nav?: boolean } = {},
): Promise<{ coins: Coin[]; missing: number }> {
  // Two round trips for the whole list instead of up to two per row; the
  // per-row reads below then hit a warm cache. Best effort — a refusal here
  // leaves each row to read for itself, exactly as before.
  await prefetchPools(rows.map((row) => row.poolAddress)).catch(() => undefined);

  const out: Array<Coin | null> = new Array(rows.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      out[index] = await hydratePool(rows[index], { nav: options.nav }).catch(() => null);
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, rows.length) }, worker));
  const coins = out.filter((coin): coin is Coin => coin !== null);
  return { coins, missing: rows.length - coins.length };
}
