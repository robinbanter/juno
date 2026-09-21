import Constants from "expo-constants";

/**
 * The Juno API client.
 *
 * Every read and every transaction comes from the Next.js app. The phone never
 * builds a Solana transaction — it asks for bytes, signs them with the embedded
 * wallet, and posts them back. See `lib/juno/tx.ts` on the server for why.
 *
 * ## Finding the server from a simulator
 *
 * `localhost` inside an iOS Simulator is the simulator, not the Mac running the
 * dev server, so a hardcoded localhost fails in exactly the environment this
 * app is demoed in. Expo already knows the host it was served from
 * (`hostUri`), which is the machine running Metro — and that is the same
 * machine running Next. So the default is derived rather than guessed, and
 * `EXPO_PUBLIC_API_URL` overrides it for a deployed backend.
 */

function inferredHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older/dev-client shapes keep it in different places.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  if (!host) return null;
  return `http://${host}:3000`;
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  inferredHost() ??
  "http://localhost:3000";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * One request.
 *
 * A phone loses its network mid-request far more often than a browser does, so
 * a timeout is mandatory rather than optional: without one a dropped connection
 * leaves a spinner on screen forever with nothing to cancel it.
 */
async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 45_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...rest.headers,
      },
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body from a 500 is still worth surfacing as a message.
      if (!response.ok) throw new ApiError(text.slice(0, 200) || "Request failed", response.status);
      throw new ApiError("The server sent something that was not JSON", response.status);
    }

    if (!response.ok) {
      const message =
        (body as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
      throw new ApiError(message, response.status);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection.", 0);
    }
    throw new ApiError(
      `Could not reach Juno at ${API_URL}. Is the server running?`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string, timeoutMs?: number) => request<T>(path, { timeoutMs }),
  post: <T>(path: string, body: unknown, timeoutMs?: number) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), timeoutMs }),
};

/* ------------------------------------------------------------------ */
/* Shapes, mirroring the server's own types                            */
/* ------------------------------------------------------------------ */

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export type CurveState = {
  progress: number;
  raisedUsd: number;
  thresholdUsd: number;
  graduated: boolean;
};

export type NavReference = {
  feed: string;
  priceUsd: number;
  deviation: number;
  updatedAt: string;
  bandBps: number;
  withinBand: boolean;
  state: "live" | "closed" | "stale";
  ageSeconds: number;
};

export type Coin = {
  address: string;
  format: "post" | "reel";
  name: string;
  symbol: string;
  description?: string;
  media: { kind: "image" | "video"; url: string; posterUrl?: string; width: number; height: number };
  creator: { handle: string; displayName: string; avatarUrl: string; wallet: string };
  createdAt: string;
  pool: string;
  config: string;
  quote: { mint: string; symbol: string; decimals: number };
  marketCap: number;
  marketCapCurrency: string;
  marketCapChangePct: number | null;
  volume24h: number | null;
  totalVolume: number | null;
  creatorRewards: number;
  holders: number | null;
  priceUsd: number;
  priceHistory?: Array<{ t: string; price: number; volume: number; side: "buy" | "sell" }>;
  /** The swap read was cut short — the ticks above are a prefix, not the history. */
  priceHistoryPartial?: boolean;
  nav?: NavReference | null;
  curve: CurveState;
  curvePreset: string;
};

export type Activity = {
  id: string;
  side: "buy" | "sell";
  actor: { handle: string; avatarUrl: string };
  amount: number;
  valueUsd: number;
  timestamp: string;
  signature?: string;
};

export type Holder = {
  rank: number;
  actor: { handle: string; avatarUrl: string };
  wallet: string;
  balance: number;
  share: number;
};

export type FeedItem =
  | {
      kind: "trade";
      id: string;
      timestamp: string;
      side: "buy" | "sell";
      amount: number;
      valueUsd: number;
      price: number;
      priceNow: number | null;
      currency: string;
      signature?: string;
      actor: { handle: string; avatarUrl: string };
      coin: {
        address: string;
        name: string;
        symbol: string;
        mediaUrl: string | null;
        mediaKind: string;
        posterUrl: string | null;
      };
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

export type PositionTrade = { t: string; side: "buy" | "sell"; base: number; price: number };

export type Position = {
  baseMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  curvePreset: string;
  balance: number;
  price: number;
  value: number;
  averageCost: number | null;
  unrealisedPnl: number | null;
  unrealisedPnlPct: number | null;
  realisedPnl: number;
  currency: string;
  graduated: boolean;
  trades: PositionTrade[];
};

export type Portfolio = {
  wallet: string;
  positions: Position[];
  /** Null when the pool walk did not finish and found nothing — not "$0". */
  totalValue: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  currency: string;
  partial: boolean;
  /** What the wallet was worth at each moment it traded, oldest first. */
  history: Array<{ t: string; value: number }>;
};

export type PostDetail = {
  id: string;
  body: string;
  timestamp: string;
  author: { wallet: string; handle: string; avatarUrl: string };
  mediaUrl: string | null;
  mediaKind: string | null;
};

export type UnsignedTransaction = { transaction: string; label: string; bytes: number };
export type BlockhashWindow = { blockhash: string; lastValidBlockHeight: number };

export type SwapBuild = {
  unsigned: UnsignedTransaction;
  window: BlockhashWindow;
  quote: { amountOut: number; minimumAmountOut: number; fee: number; priceImpact: number };
  quoteSymbol: string;
  quoteUsdRate: number | null;
  pool: string;
  symbol: string;
};

export type LaunchBuild = {
  steps: UnsignedTransaction[];
  window: BlockhashWindow;
  config: string;
  baseMint: string;
  pool: string;
};

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const juno = {
  feed: (limit = 40) =>
    api.get<{
      cluster: string;
      items: FeedItem[];
      /** The trade half was walked against a refusing endpoint — not the whole cluster. */
      tradesPartial: boolean;
    }>(`/api/juno/feed?limit=${limit}`),

  coins: (sort?: "marketCap" | "graduating") =>
    api.get<{
      cluster: string;
      coins: Coin[];
      /** Registry rows the server could not price — the list is short by this many. */
      missing: number;
    }>(
      `/api/juno/coins?limit=40${sort ? `&sort=${sort}` : ""}`,
    ),

  coin: (mint: string) =>
    api.get<{
      coin: Coin;
      activity: Activity[];
      /** The swap walk was cut short — an empty `activity` is not "no trades". */
      activityPartial: boolean;
      holders: Holder[];
      /** The holder read was refused — an empty `holders` is not "no holders". */
      holdersUnreadable: boolean;
      launchSignature: string;
    }>(`/api/juno/coins/${mint}`),

  portfolio: (wallet: string) => api.get<Portfolio>(`/api/juno/portfolio/${wallet}`),

  posts: (limit = 30) =>
    api.get<{ posts: Array<{ id: string; body: string; authorWallet: string; createdAt: string }> }>(
      `/api/juno/posts?limit=${limit}`,
    ),

  createPost: (input: {
    authorWallet: string;
    body: string;
    baseMint?: string | null;
    /** Set to reply. A comment is a post with a parent. */
    parentId?: string | null;
  }) => api.post<{ post: { id: string } }>("/api/juno/posts", input),

  post: (id: string) =>
    api.get<{
      post: PostDetail;
      replies: PostDetail[];
      replyCount: number;
      coin: {
        address: string;
        name: string;
        symbol: string;
        priceUsd: number;
        marketCap: number;
        currency: string;
        changePct: number | null;
        progress: number;
        graduated: boolean;
      } | null;
    }>(`/api/juno/posts/${id}`),

  /**
   * Index a launch after its pool transaction has confirmed.
   *
   * The server re-reads the pool from chain before writing the row, so this
   * cannot be used to claim a pool that does not exist.
   */
  recordLaunch: (input: {
    baseMint: string;
    poolAddress: string;
    configAddress: string;
    quoteMint: string;
    creatorWallet: string;
    name: string;
    symbol: string;
    format: "post" | "reel";
    curvePreset: string;
    createSignature: string;
  }) => api.post<{ pool: unknown }>("/api/juno/pools", input),

  buildSwap: (input: {
    mint: string;
    owner: string;
    side: "buy" | "sell";
    amountIn: number;
    slippageBps?: number;
  }) => api.post<SwapBuild>("/api/juno/tx/swap", input),

  buildLaunch: (input: {
    creator: string;
    name: string;
    symbol: string;
    preset: string;
    uri?: string;
    quoteMint?: string;
  }) => api.post<LaunchBuild>("/api/juno/tx/launch", input),

  submit: (input: { transaction: string; window?: BlockhashWindow; poolAddress?: string }) =>
    // Submitting waits for confirmation, which is slower than a read.
    api.post<{ signature: string }>("/api/juno/tx/submit", input, 90_000),

  /**
   * A URL the native `<Image>` can actually load, or null.
   *
   * Null is not just "absent" here — it also covers media the platform cannot
   * render, and the caller is expected to draw its own glyph instead. The
   * server falls back to an identicon encoded as `data:image/svg+xml`, which
   * renders fine in a browser and makes iOS throw "URI parsing error" out of
   * RCTImageManager, taking the whole screen down with a redbox. SVG data URIs
   * are therefore filtered out here rather than at each of the four call sites.
   */
  media: (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith("data:image/svg")) return null;
    return url.startsWith("http") ? url : `${API_URL}${url}`;
  },

  /**
   * The best *still* image for a coin, for a list row or a thumbnail.
   *
   * Reel coins carry a video in `media.url` and a real poster frame beside it.
   * Handing the video to `<Image>` renders nothing at all, which is why the
   * market list showed a grey square for every reel while the coins with no
   * media at all were fine. A still context wants the poster; only if there
   * isn't one does the video's own url get a try, and a video url that is its
   * own poster is refused rather than silently failing to draw.
   */
  still: (media: {
    kind: "image" | "video";
    url: string;
    posterUrl?: string;
  }): string | null => {
    const poster = media.posterUrl && media.posterUrl !== media.url ? media.posterUrl : null;
    if (poster) return juno.media(poster);
    return media.kind === "video" ? null : juno.media(media.url);
  },

  explorer: (kind: "tx" | "account" | "token", id: string, cluster = "devnet") =>
    `https://solscan.io/${kind}/${id}${cluster === "devnet" ? "?cluster=devnet" : ""}`,
};
