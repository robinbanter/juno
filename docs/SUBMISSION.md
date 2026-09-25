# Juno: STOCKLANA submission

**Every post is a market.** Post a photo or a reel on Juno and it launches its
own Meteora Dynamic Bonding Curve pool on Solana. People buy into the post as
they scroll, the creator earns the trading fees instead of ad revenue, and a
curve that fills graduates into a Meteora DAMM v2 pool that outlives the app.
The same curve machinery issues **pre-IPO and stock trackers**: curves shaped
like issuances, marked against Tessera's T-tokens for companies that have not
listed and against Pyth for the ones that have.

| | |
|---|---|
| Live app | https://juno-app-chi.vercel.app (devnet; Profile → *Get devnet SOL*) |
| Code | this repository: `juno-expo/` is the app, `lib/juno/` and `app/api/juno/` the server |
| Builds | [Release v1.1.0](https://github.com/nickthelegend/juno/releases/tag/v1.1.0): Android APK (arm64) and iOS Simulator build, with Privy wallets |
| Proof | [JUNO.md → On-chain proof](../JUNO.md#on-chain-proof-devnet) |

## The problem

Creators are paid by platforms, in proportion to ads, long after the attention
has moved on. Early fans who spotted a post first get nothing for it. And
tokenized equities have the opposite problem: the interesting names are the
private ones (OpenAI, SpaceX, Kalshi), and no one can make a market in them
the way a launchpad makes one in a meme.

## What Juno does

- **A feed where every item has a price.** Posts and full-screen reels, each
  with a buy dock: market cap, curve progress, buy and sell in two taps. You sign
  in with email and Privy creates an embedded Solana wallet; the server builds
  unsigned transactions and the Privy wallet signs them.
- **Pre-IPO markets.** Trade → Pre-IPO lists OpenAI, Kalshi and SpaceX with
  Tessera's live marks, holders and implied valuation. Each Juno curve beside
  them shows how far its implied price sits from the mark and whether it is
  inside its preset's band.
- **Stock trackers** against Pyth's on-chain `PriceUpdateV2` for AAPL, MSFT,
  NVDA and TSLA. They are read from mainnet, because devnet's equity feeds
  stopped updating in July.

## Meteora: Best Use of DBC

What we'd point a judge at:

1. **Four issuance shapes, measured.** `content`, `thin-name`, `ipo-book` and
   `tight-nav` are sixteen-segment `buildCurveWithLiquidityWeights` configs.
   We quoted all four on one controlled config, so the weights are the only
   variable
   ([table](../JUNO.md#the-presets-measured-on-one-config)). `thin-name` is 10×
   deeper than `content` at the issue price and takes 6× more to double.
2. **Measuring caught one of our own claims.** Uniform weights are *not* flat
   over a wide range: 1% depth grows with √price, so it varied 5× over a 25×
   range. Weights cannot narrow a range, so `tight-nav` now sets its own (1.5×)
   and refuses anything wider than 3×.
3. **Issuer and trader tooling on the live curve.** A depth chart from twelve
   live `swapQuote` calls, the largest size that stays under a 1% move, and
   **exact-out buys** (`SwapMode.ExactOut`, capped by `maximumAmountIn`).
   Finishing a nearly full curve uses `SwapMode.PartialFill`.
4. **The whole lifecycle, on chain.** Launch → trade → 100% → creator fees
   claimed → `MigrationDammV2`. We re-verified it on a fresh pool on 25 Sep.
   Every step has a Solscan link.
5. **Two findings other builders will hit.** A sixteen-segment config does not
   fit in `createConfigAndPool`: at 1,488 bytes it is over the 1,232-byte limit,
   so Juno splits it into two transactions. `token.leftover` is required, or
   the builder throws.

**Mainnet.** The DBC program is the same on both clusters, so every devnet
pool is a real DBC pool, and all four presets are also **live on mainnet**
(links in the [README](../README.md#live-on-mainnet)), with a real buy. JUNOC
was sniped by bots in its first second. Three buys landed, and each paid the
`content` preset's 9% opening fee to the creator, which is what that fee is for.

## Tessera: Best Use of Pre-IPO Stocks

- Live marks, holders, supply and implied valuation for T-OpenAI, T-Kalshi and
  T-SpaceX from Tessera's public API. The mints' own facts (program, decimals,
  authorities, transfer fee) are read from mainnet.
- A bonding curve per name, opened at parity with the mark and checked against
  it continuously.
- **Why the T-token is not the quote token.** All three mints charge a 20 bps
  transfer fee, and DBC refuses any quote mint with a live transfer fee
  (`QuoteMintHasNonZeroTransferFee`). Juno derives this from the mint at
  runtime and says so in the app, instead of pretending otherwise.

## Pyth: Best Use of Market Data

The Pyth price gates a band, and the band changes what a trader is told
before signing. A tracker whose curve drifts outside its preset's band is
flagged on the coin page and in the trade sheet. The feeds are read on-chain
(`PriceUpdateV2`), and staleness is reported rather than hidden.

## Sponsor tracks: what we target, and what we skipped

| Track | Target | What Juno does for it |
|---|---|---|
| **Main ($100k)** | Yes | A real consumer app: feed, reels, launch from a phone in two signatures, live receipts, comments and likes from real wallets, iOS + Android + web builds. |
| **Meteora DBC ($5k)** | Yes | Four measured issuance shapes, depth tooling, exact-out buys, full lifecycle to DAMM v2, all four presets live on mainnet, and a stock-paired curve priced in TSLAx using Meteora's DBC token badge, live on mainnet (`Debp87Rb…`). |
| **Tessera ($6k)** | Yes | Pre-IPO tab on Tessera's live marks for OpenAI, Kalshi and SpaceX; a bonding curve per name, marked against the T-token mark with a band warning before signing. |
| **Pyth** | Yes | Listed trackers marked against on-chain `PriceUpdateV2`; the band warning changes what the trade sheet says. |
| **PreStocks ($10k)** | No | Its rules exclude any entry that integrates non-PreStocks pre-IPO tokens, and Juno's Pre-IPO tab is built on Tessera. We chose depth on one track over a split. |
| **Clawpump ($5k)** | No | Clawpump launches through pump.fun on mainnet only; the stock-paired pool it asks for is shown instead with Juno's own TSLAx-quoted Meteora curve, live on mainnet. |

## Why Solana

A market per post only works if launching one costs cents and a buy settles
before the next swipe. A launch measured on devnet is 0.027 SOL, nearly all of
it recoverable rent. Meteora's DBC and DAMM v2 give a curve and a graduation
path without writing a program.

## Built with

Expo SDK 57 (iOS, Android, web) · Next.js 16 API on Railway · Meteora DBC and
DAMM v2 SDKs · Pyth · Tessera · Postgres (Neon) · MongoDB · Pinata/IPFS.
235 unit tests; integration tests against live devnet and mainnet.

---

## Demo script (90 seconds)

The full shot list, with narration, prep and editing notes, is in
[DEMO-VIDEO.md](DEMO-VIDEO.md). This is the short version.

1. **0:00 Feed.** Open the app. "Every post here is a market." Scroll, double-tap
   a like, tap **Buy** on a post. The sheet quotes live; point at price impact
   and "the most you can buy before the curve moves 1%".
2. **0:15 Reels.** Swipe to Reels. Full-screen video, the market dock under the
   caption, buy from the reel.
3. **0:25 Post one.** + → Post a photo, pick a curve shape (the four previews),
   sign twice. "That's a new Meteora pool, from a phone."
4. **0:40 Pre-IPO.** Trade → Pre-IPO. OpenAI at Tessera's mark; open it; the
   NAV card shows the curve's implied price inside its band, and why the
   T-token can't be the quote mint.
5. **0:55 Depth.** Details → the depth chart. "Twelve live quotes: this is what
   a buy of each size does to the price." Flip the buy to **exact tokens**.
6. **1:10 Proof.** Solscan: the graduation transaction into DAMM v2, and the
   creator fee claim.
7. **1:20 Close.** The preset table from JUNO.md: "Four issuance shapes,
   measured. One of them didn't do what its name said, so we fixed it."
