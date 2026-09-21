# Product

<!-- impeccable:product-schema 1 -->

> **Provenance:** written from the repository — `JUNO.md`, `docs/juno-brief.md`,
> the route tree, the Expo app, and the API — rather than from an interview. The
> user directed that the design run proceed without a product interview, so
> nothing here is user-confirmed. Facts are traceable to code or to the two
> documents named above; anything inferred is marked **(inferred)**.

## Platform

adaptive

Two shipped surfaces over one API, and they are not the same design problem:

- **`juno-expo/`** — Expo / React Native, iOS-first. The product. Five tabs,
  real chain data on every screen. This is what a judge is handed.
- **root Next.js app, `app/(juno)/`** — the web UI and the API the phone talks
  to. It is the link you can send someone, and it lives inside a larger,
  unrelated product (Norr) whose shell it must not contradict.

## Users

- **Creators** who publish a post or a reel and want the upside of their own
  attention. Today that upside is an ad split or a platform payout; here it is
  the trading fees on their own work.
- **Traders / collectors** scrolling a feed, deciding in seconds whether a piece
  of content is worth buying into. They are crypto-native: a ticker, a curve
  and a market cap are vocabulary, not jargon.
- **Hackathon judges** (Solana STOCKLANA), who arrive cold, have minutes, and
  are specifically checking whether the on-chain claims are real. This audience
  is temporary but it is the one the product is currently being built for, and
  it explains why so much of the UI is built to be *checked* rather than
  admired.

The operating scene is a phone, one-handed, thumb at the bottom of the screen,
often on a network and an RPC that are both slower than the user expects.

## Product Purpose

Make a post *be* a market. Publishing launches a real Meteora Dynamic Bonding
Curve pool on Solana for that specific piece of content; people buy along the
curve as they scroll; when the pool raises its `migrationQuoteThreshold` it
graduates into a Meteora DAMM v2 pool and becomes a normal AMM market that
outlives the app.

Success is someone scrolling a feed, buying into a post inside a few seconds,
and being able to verify on an explorer that what they just saw was true.

## Positioning

The nearest reference is Zora on Base. The difference is not the social layer —
it is the launch mechanics.

Meteora's DBC allows sixteen curve segments with weighted liquidity. A memecoin
launch back-loads those weights: nearly free at the start, near vertical at the
end, graduate as fast as possible. Juno ships four presets and three of them are
deliberately not that:

| Preset | Weight shape | Intent |
|---|---|---|
| `content` | back-loaded (`1.2^i`) | the default for a post or reel; cheap entry, steepens as attention arrives |
| `thin-name` | front-loaded (`0.82^i`) | a newly tokenized low-float name; deep at the issue price so early size does not gap the print |
| `ipo-book` | deep at both ends, thin in the middle | book-building — absorb the open, discover price mid-curve, flatten near the target cap |
| `tight-nav` | uniform | an asset that should track an underlying; behaves like a spread, not a launch |

Three of the four are shaped for *tokenized equity* rather than for a memecoin,
and the equity-preset coins carry a Pyth NAV reference read from on-chain
`PriceUpdateV2` accounts. A neighbouring launchpad could copy the feed; it could
not truthfully copy "our curve presets are shaped like an issuance book."

## Operating Context

- **Solana devnet by default** (`NEXT_PUBLIC_SOLANA_CLUSTER`), on the **public
  RPC by decision**. That endpoint rate-limits hard and refuses
  `getTokenLargestAccounts` and batched `getParsedTransactions` by method. A
  partial read is the *normal* case, not an edge case, and every surface has to
  be designed for it.
- **No indexer.** Swap history, 24h volume, the price chart and the portfolio
  are all decoded from pool vault deltas, walked per pool. A feed read can hold
  for tens of seconds.
- **Transactions are built on the server and signed on the device.** The key
  never leaves the phone. The app asks for bytes, signs, and posts them back.
- A launch is **two signatures**, because a sixteen-segment curve plus pool init
  exceeds Solana's 1232-byte packet limit. The second can fail after the first
  lands, leaving a config with no pool — a real state the UI must name.

## Capabilities and Constraints

Working and verifiable: DBC pool creation, real swaps through the app's own
path, a full lifecycle through migration to DAMM v2, creator fees claimed,
Pyth NAV read on-chain without an API key, IPFS-pinned token metadata,
average-cost portfolio P&L, Neon Postgres persistence, 206 unit tests plus live
integration tests.

Constraints that shape design:

- **Light only.** `userInterfaceStyle` is pinned to `light` in `app.json`; the
  palette was validated against a light surface and a half-inverted dark mode
  would break it.
- **Three states, never two.** Every read is *this is so*, *this is not so*, or
  *nobody knows*. A figure nobody measured renders as `—`, never as `0`.
- **Prices are tiny.** Coins launch around `1e-7`, so a unit price is a
  subscript-notation figure (`$0.0₆186`), not a plain decimal.
- Values can be mixed-quote (SOL or USDC), so a total is only shown when every
  part of it is in one unit.

Terminology the UI uses and must keep: *curve*, *preset*, *graduation*,
*migration*, *quote*, *ticker*, *reel*, *NAV band*.

## Brand Commitments

- **Name:** juno, lowercase in the wordmark.
- **Line:** "Every post is a market."
- **Mark:** a bonding curve drawn as a stroke with a dot held clear of it
  (`juno-expo/components/logo.tsx`). Not a generic coin or chart glyph — it
  earned its shape by being redrawn after a first attempt that "didn't mean
  anything to do with what we're doing."
- **Palette (pinned by the user, this run):** neon lime `#D6FF3D` on sage
  `#DCE7D5`, white cards, near-black ink `#12150E`. The lime always carries dark
  ink — measured at 16.00:1 against ink and 1.15:1 against white, so there is no
  white-on-lime variant to reach for. `pos #0E9F6E` / `neg #D92D20` are only ΔE
  9.0 apart under deuteranopia, so direction is always spelled out in words
  beside the colour.
- **Fonts (pinned by the user, this run):** Geist Sans + Geist Mono on web; the
  platform face (SF Pro) on native. No new typeface is to be introduced.
- **Voice:** plain, specific, and unwilling to overclaim. The product's own
  documentation leads with "what is real, and what is not." Copy states what was
  measured and admits what was not — "Some pools would not load, so this is not
  the whole cluster" is house style, not an error message.

## Evidence on Hand

Real, in-repo, and not to be fabricated around:

- Devnet transactions from this code, checkable on Solscan — a swap at
  `5PiMbFi9…4Bycxn` and a submit-route swap at `5Wmta5TR…AnpGp5`.
- Four DBC pools created by this code, one driven to 100% and migrated to
  DAMM v2; creator fees claimed on-chain.
- Real media on IPFS for the reel coins (video plus a distinct poster frame).
- `TESTPLAN.md` — 62 items, each with the observable that proves it.

Absences future work must not paper over: there are **no users**, no testimonials,
no traction numbers, no pricing, and no mainnet deployment. Follower and
following counts are not stored anywhere and must stay absent rather than
render as zero.

## Product Principles

1. **A claim the app cannot check does not ship.** An empty list from a failed
   read and an empty list from an empty market are different sentences, and the
   UI says which one it means.
2. **The post is the market.** Social and financial are not two halves bolted
   together; a card that shows one without the other is missing the product.
3. **Verifiability is a feature, not an appendix.** Signatures, pool addresses
   and explorer links are part of the design surface because the primary
   audience arrives to check.
4. **The curve is the differentiator, so show it.** Presets are drawn, not
   described in a dropdown.
5. **Designed for a slow network.** Loading and partial states are the common
   path and get the same care as the happy one.

## Accessibility & Inclusion

- Direction is never colour alone; `pos`/`neg` always carry a word or a sign.
- Reduced motion is honoured by dropping travel and keeping opacity — the app
  reads `AccessibilityInfo.isReduceMotionEnabled`.
- Every tab and icon-only control carries an `accessibilityLabel`; the tab bar
  ships no visible labels.
- Type is set on the platform face so Dynamic Type and platform rendering
  behave as the OS intends.
