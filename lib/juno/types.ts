/**
 * Juno domain types.
 *
 * Deliberately independent of the Meteora SDK's on-chain account shapes: the
 * UI speaks in already-decoded numbers (UI units, not lamports) so components
 * never carry a BN or a decimals conversion. `lib/juno/dbc.ts` owns the
 * translation from `VirtualPool`/`PoolConfig` into these.
 */

export type QuoteToken = {
  /** Mint address on Solana. */
  mint: string;
  symbol: string;
  decimals: number;
  /** Shown in the trade panel's token selector. */
  icon?: string;
};

export type Creator = {
  handle: string;
  displayName: string;
  avatarUrl: string;
  bio?: string;
  /** The creator coin's ticker, rendered as `$handle`. */
  ticker: string;
  wallet: string;
  /** Verified links row (X, etc). */
  socials?: { x?: string };
  /**
   * Null, always, until someone stores them.
   *
   * These were `number` and set to 0 everywhere, which rendered as a confident
   * "0 Followers" on a profile whose entire job is to establish credibility.
   * Typed nullable so a future render has to decide what to do about not
   * knowing rather than silently printing a zero.
   */
  followers: number | null;
  following: number | null;
  /** Real: how many coins this wallet has launched. */
  posts: number;
  /** Creator-coin market cap in USD. */
  marketCap: number;
  /**
   * What `marketCap` is denominated in. Falls back to the quote token's own
   * symbol when no USD price feed is available, so the figure is never
   * mislabelled as dollars.
   */
  marketCapCurrency: string;
  /**
   * Null when there is no trade old enough to measure against. A creator with
   * no trading history has no 24h change, and 0 would claim one.
   */
  marketCapChangePct: number | null;
};

export type MediaKind = "image" | "video" | "audio";

/**
 * How a coin was published.
 *
 * `post` is a landscape/square piece shown in the grid. `reel` is a vertical
 * video shown in the full-bleed swipe feed. The difference is not cosmetic:
 * reels get a different curve default and a different trade surface, because
 * someone buying mid-scroll is making a much faster decision than someone
 * reading a coin page.
 */
export type CoinFormat = "post" | "reel";

export type Media = {
  kind: MediaKind;
  url: string;
  /** Poster frame for video; falls back to `url` for images. */
  posterUrl?: string;
  width: number;
  height: number;
};

/**
 * A content coin: one post, one DBC pool. The post *is* the token.
 */
export type Coin = {
  /** Base mint address — the canonical id, used in `/coin/[address]`. */
  address: string;
  format: CoinFormat;
  name: string;
  symbol: string;
  description?: string;
  media: Media;
  creator: Creator;
  createdAt: string;

  /** The DBC virtual pool backing this coin. */
  pool: string;
  /** The DBC config key the pool was launched from. */
  config: string;
  quote: QuoteToken;

  marketCap: number;
  /**
   * What `marketCap` is denominated in. Falls back to the quote token's own
   * symbol when no USD price feed is available, so the figure is never
   * mislabelled as dollars.
   */
  marketCapCurrency: string;
  /**
   * 24h change as a signed ratio, or null when it cannot be derived.
   *
   * Null covers two real cases: a pool whose entire trade history is inside the
   * window, so there is no earlier price to compare against, and a history the
   * RPC would not serve. Neither is a 0% change, which is a claim about a
   * period we would not have measured.
   */
  marketCapChangePct: number | null;
  /**
   * Traded quote volume in the last 24h and across all visible history, in the
   * same unit as `marketCapCurrency`.
   *
   * Both are derived from decoded swaps (`lib/juno/swaps.ts`). Null means no
   * history was readable at all — distinct from 0, which means the market is
   * genuinely quiet.
   */
  volume24h: number | null;
  totalVolume: number | null;
  creatorRewards: number;
  /**
   * Null when the read failed — a rate-limited RPC must not render as a
   * confident zero, which is what "no holders" would claim.
   */
  holders: number | null;

  /** Price of one coin, in the quote token's USD terms. */
  priceUsd: number;
  /**
   * Realised prices over time, oldest first — the coin page's chart.
   *
   * Executed trades, not marks, so a gap means nobody traded rather than a
   * price that held. Only loaded on the coin page. Undefined when not loaded;
   * empty when loaded and the pool has never traded.
   */
  priceHistory?: PricePoint[];
  /** Where the underlying is marked, for an equity-preset launch. Coin page only. */
  nav?: NavReference | null;

  curve: CurveState;
  /** Which `lib/juno/curves.ts` preset this pool was launched with. */
  curvePreset: CurvePresetId;
  /** Social counters, shown on the reel rail. */
  likes?: number;
  commentCount?: number;
  /** Present once the pool has graduated into DAMM v2. */
  graduatedPool?: string;
  /**
   * The pool's actual sixteen-segment curve, for plotting. Only loaded on the
   * coin page — a grid of tiles has no room to show it.
   */
  shape?: CurveShape;
  /** Fee decay and supply split, read from the config. Coin page only. */
  fee?: FeeSchedule | null;
  supply?: Tokenomics | null;
};

/**
 * Bonding-curve progress toward the DAMM v2 migration threshold.
 *
 * `progress` is the quote-side ratio the DBC program itself reports
 * (`state.getPoolQuoteTokenCurveProgress`), not a price ratio — that is what
 * actually governs graduation.
 */
export type CurveState = {
  /** 0..1. */
  progress: number;
  /** Quote raised so far, in USD. */
  raisedUsd: number;
  /** `migrationQuoteThreshold`, in USD. */
  thresholdUsd: number;
  graduated: boolean;
};

import type { CurveShape } from "./curve-shape";
import type { FeeSchedule, Tokenomics } from "./economics";

/**
 * One realised trade price. Lives here rather than in `lib/juno/swaps.ts`
 * because client components render it and that module is `server-only` — a
 * type-only import would be erased, but a domain type belongs with the domain.
 */
export type PricePoint = {
  t: string;
  price: number;
  /** Quote-denominated size of the trade that set this price. */
  volume: number;
  side: TradeSide;
};

export type CurvePresetId =
  | "content"
  | "thin-name"
  | "ipo-book"
  | "tight-nav";

export type TradeSide = "buy" | "sell";

export type Activity = {
  id: string;
  side: TradeSide;
  actor: Pick<Creator, "handle" | "avatarUrl">;
  /** Coin amount, in UI units. */
  amount: number;
  /** Quote value of the trade, in USD. */
  valueUsd: number;
  timestamp: string;
  signature?: string;
};

export type Holder = {
  rank: number;
  actor: Pick<Creator, "handle" | "avatarUrl">;
  wallet: string;
  balance: number;
  /** Share of circulating supply, 0..1. */
  share: number;
};

export type Comment = {
  id: string;
  actor: Pick<Creator, "handle" | "avatarUrl">;
  body: string;
  timestamp: string;
  /** Trades can carry a comment, which is what Zora surfaces here. */
  side?: TradeSide;
};

/** Reference price for a tokenized equity, for the NAV band. */
export type NavReference = {
  /** Feed id, or a name like "Equity.US.AAPL/USD". */
  feed: string;
  priceUsd: number;
  /** How far the curve price sits from NAV, as a signed ratio. */
  deviation: number;
  updatedAt: string;
  /** The preset's own tolerance, in basis points. */
  bandBps: number;
  withinBand: boolean;
  /**
   * Whether this mark is live, a last close, or too old to trust.
   *
   * An equity feed stops publishing when the exchange shuts, so "closed" is the
   * normal weekend state and means Friday's close — not a failed read. The UI
   * has to say which, because a stale number presented as live is the kind of
   * thing someone trades on.
   */
  state: "live" | "closed" | "stale";
  ageSeconds: number;
};
