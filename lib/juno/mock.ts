/**
 * Demo fixtures.
 *
 * These exist so the component library can be reviewed and iterated on before
 * a pool is live on mainnet. Every shape here is the same shape
 * `lib/juno/dbc.ts` produces from real accounts, so swapping the data source
 * is a one-line change in each page and touches no component.
 */

import { USDC } from "./dbc";
import type { Activity, Coin, Comment, Creator, Holder } from "./types";

const AVATAR = (seed: string) => `https://picsum.photos/seed/${seed}/120/120`;
const SHOT = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const DEMO_CREATOR: Creator = {
  handle: "embed",
  displayName: "Embed: AERON-V",
  avatarUrl: AVATAR("embed"),
  ticker: "embed",
  wallet: "7xKXtg2CW3fmZ8Yk9Qw1vNpLr4sTuVbHjD6eAqCnM5Rz",
  bio: "Embed.City — an evolving virtual world rebuilding the metropolis. Ownership has moved past tangible assets; these are digital assets holding real-world value.",
  socials: { x: "https://x.com/embed" },
  followers: 1300,
  following: 3300,
  posts: 45,
  marketCap: 6730,
  marketCapChangePct: 0.0421,
};

const TITLES = [
  ["Town Hall", "The Art Deco–styled Town Hall in the New Metropolis Region is a striking blend of classic grandeur and futuristic vision — a monumental symbol of civic pride in a city defined by innovation."],
  ["Skyline Draft", "First pass at the northern skyline. Towers scale with district density."],
  ["Quantum Core", "The compute substrate the whole city runs on, rendered honestly for once."],
  ["Signal Deck", "Trading floor of the exchange district, mid-session."],
  ["Periodic", "Every material in the city, indexed."],
  ["Night Market", "Street level, 2am, district nine."],
  ["Foundry", "Where the assets are actually minted."],
  ["Transit Spine", "The line that made the outer rings livable."],
  ["Observation", "Looking back at the core from the ridge."],
] as const;

/** Sizes are varied on purpose — the profile grid staggers on aspect ratio. */
const SHAPES: Array<[number, number]> = [
  [800, 500], [600, 900], [700, 700], [640, 880], [900, 600],
  [700, 760], [820, 520], [600, 840], [760, 700],
];

export const DEMO_COINS: Coin[] = TITLES.map(([name, description], i) => {
  const [w, h] = SHAPES[i % SHAPES.length];
  const marketCap = [469.82, 748.18, 1240, 312.5, 2210, 89.4, 5400, 176.2, 940][i] ?? 500;
  const threshold = 2020;
  const progress = Math.min(0.98, marketCap / threshold);

  return {
    address: `Juno${String(i + 1).padStart(2, "0")}Base1111111111111111111111111111`,
    format: "post",
    name,
    symbol: name,
    description,
    media: {
      kind: i % 3 === 0 ? "video" : "image",
      url: SHOT(`juno-${i}`, w, h),
      posterUrl: SHOT(`juno-${i}`, w, h),
      width: w,
      height: h,
    },
    creator: DEMO_CREATOR,
    createdAt: new Date(Date.now() - (i + 1) * 9 * 3600_000).toISOString(),
    pool: `Juno${String(i + 1).padStart(2, "0")}Pool1111111111111111111111111111`,
    config: "JunoCfgEquity1111111111111111111111111111111",
    quote: USDC,
    marketCap,
    marketCapChangePct: i % 4 === 3 ? -0.018 : 0.031,
    volume24h: [3.53, 31.25, 142.8, 9.1, 480.2, 2.2, 1210, 18.4, 77.5][i] ?? 10,
    totalVolume: (marketCap * 1.8) | 0,
    creatorRewards: [0.98, 23.4, 11.2, 1.4, 64.8, 0.3, 190.5, 2.9, 12.1][i] ?? 1,
    holders: [6, 9, 21, 4, 58, 2, 140, 7, 19][i] ?? 5,
    priceUsd: marketCap / 1_000_000_000,
    curve: {
      progress,
      raisedUsd: marketCap,
      thresholdUsd: threshold,
      graduated: false,
    },
    curvePreset: i === 0 ? "ipo-book" : i % 3 === 1 ? "thin-name" : "content",
  } satisfies Coin;
});

export const DEMO_COIN = DEMO_COINS[0];

/* ------------------------------------------------------------------ */
/* Reels                                                               */
/* ------------------------------------------------------------------ */

/**
 * Sample clips so the feed actually plays. They are landscape sources shown
 * in a 9:16 frame with `object-cover`, which crops rather than letterboxes —
 * enough to exercise playback, scrubbing and the snap feed before real
 * creator uploads exist.
 */
const CLIPS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

const REELS = [
  ["Nightfall over District Nine", "Shot this on the last run before the towers went up. Sound on."],
  ["Foundry, 4am", "Where every asset in the city actually gets minted."],
  ["Transit Spine — full length", "Twelve minutes end to end, cut to ninety seconds."],
  ["The auction floor", "First open of the new listing. You can hear it turn."],
  ["Rooftop, looking back", "The core from the ridge. No edit, no grade."],
] as const;

export const DEMO_REELS: Coin[] = REELS.map(([name, description], i) => {
  const marketCap = [1820, 640, 12_400, 310, 4_900][i] ?? 500;
  const threshold = 5_000;

  return {
    address: `JunoReel${String(i + 1).padStart(2, "0")}11111111111111111111111111`,
    format: "reel",
    name,
    symbol: name.split(" ")[0].replace(/[^A-Za-z]/g, "").toUpperCase(),
    description,
    media: {
      kind: "video",
      url: CLIPS[i % CLIPS.length],
      posterUrl: SHOT(`reel-${i}`, 720, 1280),
      width: 720,
      height: 1280,
    },
    creator: DEMO_CREATOR,
    createdAt: new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString(),
    pool: `JunoReel${String(i + 1).padStart(2, "0")}Pool111111111111111111111111`,
    config: "JunoCfgReel11111111111111111111111111111111",
    quote: USDC,
    marketCap,
    marketCapChangePct: i === 3 ? -0.042 : 0.087,
    volume24h: [410.2, 88.1, 3_100, 12.4, 960.5][i] ?? 50,
    totalVolume: (marketCap * 2.4) | 0,
    creatorRewards: [18.4, 3.1, 142.7, 0.6, 44.2][i] ?? 2,
    holders: [64, 19, 388, 7, 151][i] ?? 10,
    priceUsd: marketCap / 1_000_000_000,
    curve: {
      progress: Math.min(0.98, marketCap / threshold),
      raisedUsd: marketCap,
      thresholdUsd: threshold,
      graduated: false,
    },
    // Reels move fast and are bought on impulse mid-scroll, so they default to
    // the content curve rather than an equity shape.
    curvePreset: "content",
    likes: [12_400, 3_100, 88_200, 640, 21_700][i] ?? 500,
    commentCount: [214, 47, 1_900, 12, 388][i] ?? 10,
  } satisfies Coin;
});

/** Everything a creator has published, newest first. */
export const DEMO_ALL: Coin[] = [...DEMO_REELS, ...DEMO_COINS].sort(
  (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
);


const TRADERS = ["embed", "aeron", "kadex", "nova", "rill"] as const;

export const DEMO_ACTIVITY: Activity[] = ([
  { side: "buy", amount: 7_500_000, valueUsd: 2.51, hours: 9 },
  { side: "buy", amount: 5_300_000, valueUsd: 1.01, hours: 72 },
  { side: "sell", amount: 7_100_000, valueUsd: 1, hours: 1440 },
  { side: "buy", amount: 7_200_000, valueUsd: 1, hours: 1440 },
  { side: "buy", amount: 11_000_000, valueUsd: 0.5, hours: 1440 },
] as const).map((row, i) => ({
  id: `act-${i}`,
  side: row.side,
  actor: { handle: TRADERS[i % TRADERS.length], avatarUrl: AVATAR(TRADERS[i % TRADERS.length]) },
  amount: row.amount,
  valueUsd: row.valueUsd,
  timestamp: new Date(Date.now() - row.hours * 3600_000).toISOString(),
}));

export const DEMO_HOLDERS: Holder[] = TRADERS.map((handle, i) => ({
  rank: i + 1,
  actor: { handle, avatarUrl: AVATAR(handle) },
  wallet: `${handle}Wa11et111111111111111111111111111111111`,
  balance: 40_000_000 / (i + 1),
  share: 0.21 / (i + 1),
}));

export const DEMO_COMMENTS: Comment[] = [
  {
    id: "c-1",
    actor: { handle: "aeron", avatarUrl: AVATAR("aeron") },
    body: "The Art Deco read on a compute district is a genuinely new idea. In.",
    timestamp: new Date(Date.now() - 5 * 3600_000).toISOString(),
    side: "buy",
  },
];
