/**
 * Seed creator posts for the social feed.
 *
 * The feed mixes real trades with what creators wrote. Trades come from chain
 * and are only there if someone traded; posts have to exist. A demo that opens
 * on an empty feed reads as a broken app rather than a quiet one, and on a
 * throttled public RPC the trade half can legitimately come back short — so the
 * post half is what guarantees the first screen has something on it.
 *
 * Posts are attached to pools that actually exist on this cluster, so every
 * "about $TICKER" link resolves to a real coin.
 *
 * Needs the app running (npm run dev), or NEXT_PUBLIC_SITE_URL pointing at a
 * deployment.
 *
 *   npm run juno:seed-posts
 */

/**
 * Talks to the running app over HTTP rather than importing the data layer.
 *
 * `lib/juno/posts.ts` and the registry are `server-only`, which throws outside
 * a React Server Component graph — and every other script here (`juno-launch`
 * included) already follows this pattern. Going through the API also means the
 * seed exercises the same endpoint the phone will.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

/**
 * The wallet seeded posts are attributed to — the same devnet launcher that
 * opened the demo pools, so the feed's authors are accounts that really did
 * something rather than invented identities.
 */
const SEED_AUTHOR = "9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE";

/**
 * Written to be true about this project rather than to fill space. Each one
 * says something a reader could check.
 */
const GENERIC: string[] = [
  "Every post here is a market. Publishing one opens a Meteora bonding curve for it, and the curve is the price.",
  "The four curve presets are the actual work. A memecoin back-loads its liquidity so it graduates fast; an equity issuance front-loads it so early size fills at the issue price instead of gapping the print.",
  "Creator fees are claimable on-chain. Not a rev-share agreement — a transaction.",
  "When a pool raises its migration threshold it graduates into a DAMM v2 pool and keeps trading after the app is gone.",
  "Prices here are read from Pyth's on-chain accounts, the same values a Solana program would see.",
];

/** Said about a specific coin, chosen by the preset it was launched with. */
const BY_PRESET: Record<string, string[]> = {
  "ipo-book": [
    "Opened $%s on the ipo-book curve: deep at both ends, thin in the middle. The opening gets absorbed, price is discovered mid-curve, and the last buyers do not pay a vertical.",
    "$%s is book-shaped on purpose. Sixteen segments, weighted like an order book rather than a memecoin.",
  ],
  "thin-name": [
    "$%s uses the thin-name curve — liquidity front-loaded so early size fills at the issue price instead of gapping the print.",
    "Front-loaded weights on $%s. A newly tokenised low-float name needs depth at the open, not after it.",
  ],
  "tight-nav": [
    "$%s is on tight-nav: uniform weights, so it behaves like a spread rather than a launch. It is meant to track, not to moon.",
    "The NAV band on $%s is the point. A bonding curve has no idea what the underlying costs — Pyth is what closes that loop.",
  ],
  content: [
    "$%s is a post that happens to be tradable. Cheap to enter, steepens as attention arrives.",
    "Back-loaded curve on $%s — the content preset. Early buyers are genuinely early.",
  ],
};

type PoolRow = {
  baseMint: string;
  symbol: string;
  curvePreset: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SITE}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status} ${body.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

async function main() {
  const pools = (await api<{ pools: PoolRow[] }>("/api/juno/pools")).pools;
  if (pools.length === 0) {
    console.log("No pools on this cluster — launch one first with npm run juno:launch.");
    return;
  }

  // Do not seed twice. A feed with the same sentence four times looks worse
  // than an empty one.
  const existing = (await api<{ posts: Array<{ body: string }> }>("/api/juno/posts?limit=100")).posts;
  const seen = new Set(existing.map((row) => row.body));

  const planned: Array<{ body: string; baseMint: string | null }> = [];

  for (const line of GENERIC) planned.push({ body: line, baseMint: null });

  for (const pool of pools.slice(0, 6)) {
    const options = BY_PRESET[pool.curvePreset] ?? BY_PRESET.content;
    const template = options[pools.indexOf(pool) % options.length];
    planned.push({
      body: template.replace("%s", pool.symbol),
      baseMint: pool.baseMint,
    });
  }

  let written = 0;
  for (const post of planned) {
    if (seen.has(post.body)) continue;
    await api("/api/juno/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authorWallet: SEED_AUTHOR,
        body: post.body,
        baseMint: post.baseMint,
      }),
    });
    written += 1;
  }

  const total = (await api<{ posts: unknown[] }>("/api/juno/posts?limit=100")).posts;
  console.log(`Seeded ${written} new post(s). ${total.length} post(s) total.`);
  console.log(`Skipped ${planned.length - written} already present.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
