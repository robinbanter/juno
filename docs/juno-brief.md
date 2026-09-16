# Juno — project brief for external review

Paste this whole file into Grok (or any reviewer) along with the questions at
the end.

---

## 1. What Juno is

**Juno is a social app where every post is a tradeable market.**

Think Instagram or TikTok, except publishing a post or a reel also launches a
token for it. Anyone scrolling can buy into a piece of content the moment they
see it. The creator earns from trading fees on their own work instead of from
ad revenue or a platform payout.

The token mechanics are not a bolt-on. Each post/reel creates a **Meteora
Dynamic Bonding Curve (DBC)** pool on Solana. People buy and sell along that
curve. When the pool raises enough quote liquidity it hits its
`migrationQuoteThreshold` and **graduates into a Meteora DAMM v2 pool** — at
which point it is a normal AMM market that outlives the app.

The nearest reference point is Zora on Base. Juno's difference is on the
launch mechanics, not the social layer — see §4.

---

## 2. Current state — what actually exists

Honest split, because review quality depends on it.

### Working now

- **6 routes**, all rendering, production build passes:
  - `/explore` — grid of all coins; `?q=` search, `?sort=trending` by 24h volume
  - `/reels` — full-bleed vertical swipe feed (snap scroll, one video plays at a
    time via IntersectionObserver, keyboard nav)
  - `/coin/[address]` — coin page: media, market cap / volume / creator rewards,
    graduation bar, buy/sell panel, Activity / Holders / Comments / Details
  - `/creator/[handle]` — profile: posts, reels, collected, activity
  - `/create` — launch flow: pick Post or Reel, pick a curve preset, set
    valuations, choose quote token
  - `/activity` — global trade feed
- **~4,300 lines** of app source across 41 files, fully typechecked.
- **140 unit tests passing**, including every curve preset validated against the
  Meteora SDK's own `validateConfigParameters`.
- **The DBC adapter is real code against the real SDK** — not stubs:
  - `fetchPoolSnapshot()` → `state.getPool`, `getPoolConfig`,
    `getPoolQuoteTokenCurveProgress`, `getPoolMigrationQuoteThreshold`
  - `quoteTrade()` → `pool.swapQuote`
  - `buildLaunchTransaction()` → `partner.createConfigAndPool`
  - `buildSwapTransaction()` → `pool.swap`
  - `poolAddressFor()` → `deriveDbcPoolAddress`
- **4 curve presets** (see §4), each a full 16-segment liquidity-weight config.

### Not built yet — the honest gaps

- **No wallet adapter is connected.** Zero `@solana/wallet-adapter` usage in
  source. Every trade/launch button is inert.
- **No pool has ever been created on mainnet or devnet.** The transaction
  builders have never been signed and sent.
- **Every page reads from `lib/juno/mock.ts`**, not from chain.
- **No indexer.** Activity, holders and comments are fixtures. There is no
  process reading DBC swap events.
- **No media upload.** The create form has a file input that goes nowhere.
- **No auth, no database, no metadata hosting.**
- **No price chart.** The coin page has a chart toggle that says "still
  indexing".

So: the **product surface and the on-chain library are built; they have never
been connected to each other or to a wallet.**

---

## 3. Stack

- Next.js 16.2 (App Router), React 19, TypeScript, Tailwind v4
- `@meteora-ag/dynamic-bonding-curve-sdk` v1.5.12
- `@solana/web3.js` v1
- DBC program id `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` (same on
  mainnet and devnet)
- Default quote token USDC; SOL also supported
- Repo also contains an unrelated prior app (an adult-content app called Norr)
  sharing the same Next install. Juno is namespaced under `app/(juno)/`,
  `components/juno/`, `lib/juno/`.

---

## 4. The differentiator — curve presets

This is the part meant to win the Meteora bounty, so it needs the harshest
review.

Meteora's DBC lets you place **16 curve segments and weight the liquidity in
each** (`buildCurveWithLiquidityWeights`). The weights set the character of a
launch:

> more liquidity in a segment → more supply absorbed per unit of price → a
> flatter stretch of curve

A memecoin launch **back-loads** its weights: nearly free at the start, near
vertical at the end, graduate as fast as possible. Juno ships four presets, and
three of them are deliberately not that:

| Preset | Weight shape | Intent |
| --- | --- | --- |
| `content` | back-loaded (`1.2^i`) | default for a post/reel; cheap entry, steepens with attention |
| `thin-name` | **front-loaded** (`0.82^i`) | newly tokenized low-float stock; deep book at the issue price so early size does not gap the print |
| `ipo-book` | deep at both ends, thin in the middle | book-building: absorb the open, discover price mid-curve, flatten near the target cap so it does not moon before graduating |
| `tight-nav` | uniform | an asset that should track an underlying; behaves like a spread, not a launch |

Every preset also:

- decays fees from an anti-snipe opening (2–9%) to an equity-like spread
  (0.25–1%) via `FeeSchedulerExponential`
- migrates to **DAMM v2** (DAMM v1 is deprecated for new configs)
- avoids `BaseFeeMode.RateLimiter` (also deprecated for new configs)
- permanently locks migrated liquidity, so a graduated pool keeps a floor
  rather than letting the creator pull it on day one

`thin-name`, `ipo-book` and `tight-nav` also carry a `navBandBps` field
intended for a price band against a reference feed. **That field is currently
unused — nothing reads it.**

---

## 5. Hackathon context

**Solana STOCKLANA hackathon.** Theme: tokenized stocks / equities on Solana.
Deadline **25 Sep 2026, 4:00 PM ET** (extended from 18 Sep). Submissions need a
GitHub link plus a live demo or video walkthrough.

### Main track — $100,000
Judged on: real user problem, working end-to-end demo, a reason it is on
Solana, execution quality.

### Sponsor tracks (total pool $121k)

1. **Meteora — Best Use of Dynamic Bonding Curve — $5,000.**
   Wants DBC used for tokenized stocks: novel curve/fee configurations,
   creative graduation rules, or issuer tooling. Explicitly: *"Working code on
   mainnet beats slides."* Judged on originality of the DBC configuration or
   use case, technical soundness, and whether the idea has a life after the
   hackathon.
2. **Clawpump — Stocknized Agent — $5,000** ($3k/$1.5k/$500).
   Launch a token with a **stock-paired liquidity pool** using Clawpump and
   Meteora.
3. **PreStocks — Best Use of PreStocks — $5,000.**
   Build using **tokenized pre-IPO stocks via their API**.
4. **Tessera — Best Use of Tessera Pre-IPO Stocks — $6,000.**
   Products using **OpenAI or Kalshi T-Tokens**, utilising bonding curves.
5. **Pyth Network — Best Use of Pyth Market Data** — 3 months Pyth Pro.
   Applications where *"live financial data does real work."*

Juno currently targets **Meteora only**. Nothing from Clawpump, PreStocks,
Tessera or Pyth is integrated.

---

## 6. The tension I want reviewed

Juno is a **social content app**. The hackathon is about **tokenized stocks**.

The curve presets are the bridge — `thin-name` / `ipo-book` / `tight-nav` are
equity-issuance shapes, and they are real, tested configs. But nothing in the
running product actually touches a stock. The demo shows people coining photos
and videos.

That is the strategic question below.

---

## Questions

1. **Positioning.** Is "social app with equity-grade curve presets" a coherent
   STOCKLANA entry, or is it a content app wearing a costume? Should Juno
   pivot the demo toward tokenized equities (e.g. reels *about* a stock, with
   the coin quoted in / paired against that stock), keep the social framing and
   lean on the curve presets, or split into two demos?

2. **Meteora bounty.** The bounty says mainnet beats slides and Juno has zero
   on-chain pools. Given ~9 days: what is the minimum credible mainnet
   footprint — one pool? one pool per preset? a graduated pool that completed
   migration to DAMM v2? Rank by judge impact per hour of work.

3. **Curve config critique.** Are the four weight shapes actually sound as
   market design, or is any of them wrong in a way a Meteora judge would catch?
   Specifically: is front-loading liquidity (`0.82^i`) the right primitive for
   "deep at the issue price", and does `tight-nav`'s uniform weighting really
   produce near-flat price, or does constant-product geometry defeat that?

4. **Sponsor stacking.** Which additional tracks are realistically winnable
   from this codebase in the time left, and **specifically where in the app
   would each integration live**?
   - Pyth: the unused `navBandBps` suggests a NAV band on the coin page and a
     warning in the trade panel. Worth it? What else would make Pyth data "do
     real work" rather than be decoration?
   - PreStocks / Tessera: would using a pre-IPO token as the **quote token** of
     a DBC pool qualify, and is that technically sane (Token-2022, decimals,
     liquidity)?
   - Clawpump: what does "stock-paired liquidity pool" actually require?
   Give a cost/benefit per track and name the ones to skip.

5. **Features.** What is missing that judges would notice within 60 seconds of
   the live demo? Rank by impact. Candidates: wallet connect, one live mainnet
   pool, a real price chart, an indexer for activity/holders, media upload,
   a graduation/migration view, an issuer dashboard.

6. **Reels.** Does a TikTok-style feed strengthen this for a *stocks*
   hackathon or dilute it? If it stays, what is the strongest equity-native
   framing for it?

7. **The "life after the hackathon" test.** Meteora judges on that explicitly.
   What is the most defensible answer for Juno, and what one feature would make
   that answer credible instead of aspirational?

8. **Brutal take.** If you think this does not place, say so and say what you
   would build instead with the same 9 days and the same codebase.
