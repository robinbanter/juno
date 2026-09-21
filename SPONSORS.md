# Sponsor audit — STOCKLANA

Researched from the real APIs, SDKs and on-chain accounts, and audited against
what this codebase actually calls. Every status below was verified by running
the thing, not by grepping for a package name.

**Deadline:** Fri 25 Sep 2026, 16:00 ET.

---

## The one-line verdict per track

| Sponsor | Prize | Status | Depth |
|---|---|---|---|
| **Meteora DBC** | $5,000 | **GENUINELY USED** | Deep on the curve, shallow on everything else — **6 of 60 SDK methods** |
| **Pyth** | 3mo Pyth Pro | **GENUINELY USED** | Real on-chain `PriceUpdateV2` reads, keyless. Confidence and EMA decoded-or-available but unused |
| **Tessera** | $6,000 | **GENUINELY USED** | Live marks drive a real NAV band on three real markets |
| **PreStocks** | $10,000 (5/3/2k) | **MISSING — and mutually exclusive with Tessera** | See the eligibility trap below |
| **Clawpump** | $5,000 (3/1.5/0.5k) | **MISSING** | Self-serve key; the "Meteora" half is undocumented on their side |

---

## 1. Meteora DBC — GENUINELY USED, but using a sixth of the surface

### What is real, with call sites

| Capability | Where | Status |
|---|---|---|
| `buildCurveWithLiquidityWeights` — 16-segment curves | `lib/juno/curve-shape.ts:109`, `lib/juno/dbc.ts:543` | **GENUINELY USED.** Four presets, all four in production on devnet |
| `partner.createConfigAndPoolWithFirstBuy` | `lib/juno/dbc.ts:557` | **GENUINELY USED.** Two-tx launch, forced by the 1232-byte packet limit |
| `pool.swapQuote` | `lib/juno/dbc.ts:446` | **GENUINELY USED.** Every quote in the app and the depth endpoint |
| `pool.swap` | `lib/juno/dbc.ts:713` | **GENUINELY USED.** Real signed devnet fills |
| `state.getPool` / `getPoolByBaseMint` | `lib/juno/dbc.ts:280`, `scripts/juno-inspect.ts:27` | **GENUINELY USED** |
| `state.getPoolFeeMetrics` | `lib/juno/chain.ts:255` | **GENUINELY USED.** Creator rewards figure |
| `creator.claimCreatorTradingFee` | `lib/juno/dbc.ts:802` → `CreatorPanel.tsx:64` | **GENUINELY USED**, UI-reachable, unverified end-to-end |
| `migration.migrateToDammV2` | `lib/juno/dbc.ts:839` → `CreatorPanel.tsx:73` | **GENUINELY USED**, UI-reachable, unverified end-to-end |

### The 54 untouched methods, and the config space we never vary

Every `ConfigParameters` choice this project makes is fixed in
`lib/juno/curves.ts`: exponential fee scheduler, dynamic fees on, quote-token
collection, DAMM v2 migration, immutable token authority, SPL Token, 6
decimals, 100% creator-locked liquidity, zero pool-creation fee, zero
migration fee, no locked vesting, no LP vesting, no referral, no fixed supply,
no transfer hook, no market-cap fee scheduler, no compounding fee.

**MISSING entirely:** `swap2` (ExactOut, PartialFill), `getQuoteFromInputAmount`
/ `getQuoteFromOutputAmount` (quote a curve *before* it exists),
`createPoolWithPartnerAndCreatorFirstBuy`, `createPartnerMetadata`,
`createPoolMetadata`, `transferPoolCreator`, all four surplus and
migration-fee withdrawals, `withdrawLeftover`, `createLocker`,
`getPoolFeeBreakdown`, `getPoolsFeesByConfig`, `getPoolsFeesByCreator`,
`getTokenBadge`, `getPoolQuoteTokenCurveProgress`, referral fees, and the five
curve builders other than the one we use.

### **The finding that matters most**

Meteora has created **DBC token badges** — PDAs owned by the DBC program
`dbcij3LW…` — for tokenized equity mints. Verified on mainnet:

```
NVDA  mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM  exists
TSLA  XhM8atXDua58KZnZFLu5vJjzaNWjXaEvpPPEVnHn1ax  exists
AAPL  8VeVZe3Zxfpax2qQUp7i68FCLspLYErm2FJChc5NDuVn  exists
SPY   D2THzeQLHaDeKBzzmTNuWEWw23WPM8vVhLvUmSPEpNeL  exists
MSFT  5xcYXjnDvujGNdsu6FtVZTGJHsfWKSuSnh6zNRJ5xF9Q  exists
SPCX  EKoLfymRhebAHQb5xBLM5E8F2mWqRAvUYfkydqCpic4i  exists   ← SpaceX
USDC  CuDF5wXJy45BskSCW2agUs6s71RGztQyDwf5eaoFrFwG  absent   (plain SPL, needs none)
```

**A Juno curve can be quoted in a real tokenized stock.** These mints carry no
transfer fee, so `is_supported_quote_mint` returns false rather than erroring,
which is what makes the badge path reachable — and Meteora has already minted
the badges. Their track says, in their words: *"We want to see what it looks
like for tokenized stocks."* This is the literal answer and nothing in the
codebase does it yet.

---

## 2. Pyth — GENUINELY USED, keyless, and deliberately so

`lib/juno/pyth.ts` reads `PriceUpdateV2` accounts from mainnet directly.
Verified live: NVDA at $227.02, age advancing 11s → 33s → 53s across reads.

Confirmed by probe: **every Hermes price endpoint is now 401**, Benchmarks is
401 since 26 Aug 2026, and Express Relay was wound down in July 2026. The only
key-free way to get a live Pyth price today is exactly what this repo does —
and it is also what a Solana program would see.

**IMPORTED BUT UNUSED:** `confidence` is decoded at `lib/juno/pyth.ts` and
carried on `PythPrice`, but appears in no Juno surface. **MISSING:**
`ema_price` / `ema_conf` / `prev_publish_time` / `posted_slot` sit after
`publish_time` in the account and the decoder stops before them. Pyth's own
guidance is to use `μ−σ` when valuing an asset and `μ+σ` for a liability, and
to prefer EMA for settlement. We do neither.

**The caveat worth knowing:** `Equity.Index.OPENAI/USD` and
`Equity.Index.ANTHROPIC/USD` exist as **24/7** feeds, and `Equity.Index.SPCX/USD`
exists for SpaceX — but none of the `Equity.Index.*` family is published to
the Solana push oracle. Shards 0–5 all return nothing. They are reachable only
through key-gated Hermes or Pyth Pro. The most distinctive Pyth data for this
exact product sits behind the one door we chose not to open.

---

## 3. Tessera — GENUINELY USED

Live marks drive the NAV band on three markets launched for it. Verified: Juno
returns `{T-OpenAI: 812.79, T-Kalshi: 413.8, T-SpaceX: 423}`, identical to a
direct call to `rest-api.tessera.pe`. `tesseraOnChain` reads the 20 bps
transfer fee, the live freeze authority and the un-renounced mint authority
off the mainnet mint rather than repeating documentation.

**MISSING:** `/v1/public/tokens` gives `latest_supply` and a metadata `uri`
per token; we read supply but never the CDN metadata. There is no history
endpoint, so any time series about a T-token has to be Juno's own observation.

---

## 4. PreStocks — MISSING, and there is an eligibility trap

Their API is public and keyless — `GET /api/prestocks` returns 8 tokens with
`markPrice`, `markValuation`, `supply`, `contract_address`; `GET /api/stats`
returns daily volume and holder time series. Only those two endpoints exist.

**Do not integrate it.** The track's own rule: *projects integrating
non-PreStocks pre-IPO tokens are ineligible.* Juno already integrates Tessera
T-Tokens, so **the Tessera and PreStocks tracks are mutually exclusive.**
Tessera is worth $6,000 as a single prize, is already built and verified, and
PreStocks would mean tearing it out. Not worth it.

Two technical notes if that call is ever revisited: all 8 mints carry a **100
bps transfer fee** (recently raised from 50), so they are as DBC-quote-ineligible
as Tessera's; and they use `scaledUiAmountConfig` for stock splits, so
`amount / 10**decimals` is **wrong** — SPACEX is ×5, OPENAI ×1.486. Use
`uiAmount`.

---

## 5. Clawpump — MISSING

Self-serve `cpk_` key behind a Google sign-in; no sponsor approval queue.
`GET /api/tokens` and `GET /api/pump-pairs` are public — the latter returns
170 equity mints including the xStocks NVDA/TSLA/AAPL/SPY/MSFT and SPCX/SNDK.

The honest problem: the track says *"using clawpump and Meteora"*, and
**Clawpump publishes no Meteora endpoint.** `meteora_dbc` appears as a
`launchPlatform` in their own token index, but `/developers` has zero mentions
of `dbc` or `meteora`. So either you accept a pump.fun launch with
`pumpQuoteMint` set to an equity mint and argue it meets the spirit, or you
drive Meteora DBC yourself — which is the half this project is already good at
— and use Clawpump for the agent, wallet and fee layer.

Launching through them costs real mainnet SOL or USDC over x402.

---

## Where deeper integration genuinely fits — and where it would be forced

**Fits.** Juno is a launchpad whose entire thesis is *equity-shaped curves
marked against a real reference*. A stock-quoted curve is not a bolt-on; it is
the thing the product already claims to be. Same for the unused half of the
DBC config surface: the four presets are a market-design argument, and every
untouched knob — fee schedulers, vesting, migration fees, exact-out — is more
of the same argument.

**Forced.** PreStocks is forced by construction (it would cost us Tessera).
Clawpump's *agent* framing is orthogonal to a social trading app — Juno has no
autonomous agents and inventing some to qualify would show. The one honest
Clawpump angle is the quote-asset catalogue, and we can get the same mints
from the chain without them.

---

# 50 features, ranked by how load-bearing the sponsor tech is

Ranked so that **#1 cannot exist without the sponsor's technology** and **#50
would work identically with anything else**. "Depth" says whether the sponsor
capability is the feature or a call inside it.

## Tier 1 — impossible without the sponsor (1–10)

| # | Feature | Capability | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **Launch a curve quoted in a tokenized stock.** A Juno market priced in NVDA/TSLA/SPY/SPCX instead of SOL, using the DBC token badges Meteora has already minted. | DBC `createConfig` with `tokenBadge` + a badged equity quote mint | Core | Their track asks, verbatim, what DBC looks like for tokenized stocks. This is the literal answer, and the badge check is the reason most teams will conclude it is impossible. |
| 2 | **SpaceX priced two ways, side by side.** Pyth's `Equity.US.SPCX/USD` on-chain read against Tessera's T-SpaceX mark, with the spread as the product. | Pyth push oracle + Tessera REST | Core | The Pyth track literally lists "price-comparison surface" as a build idea, and this compares an oracle against a private issuer's own mark. Nobody else has both. |
| 3 | **Exact-out buys.** "Buy exactly 1,000,000 tokens" priced backwards through the curve. | `swap2` with `SwapMode.ExactOut` | Core | Nearly every DBC clone ships exact-in only. `swap2` is in the SDK and untouched by this repo. |
| 4 | **Quote a curve before it exists.** The launch form prices a $500 buy against each preset *before* anything is on chain. | `getQuoteFromInputAmount` on a `ConfigParameters` | Core | Issuer tooling in one screen, and it uses the one SDK method that exists purely for pre-launch design. |
| 5 | **Confidence-aware trade warnings.** Refuse or flag a trade when Pyth's confidence band is wide enough that the NAV comparison is not meaningful. | `PriceUpdateV2.conf`, used directionally (μ−σ for assets) | Core | Pyth's own best-practice doc prescribes this and almost nobody implements it. We already decode `conf` and show it nowhere. |
| 6 | **Market-cap fee scheduler on the graduated pool.** Fees that step down as the migrated DAMM v2 pool hits price multiples, not as time passes. | `DammV2BaseFeeMode.FeeMarketCapScheduler*` | Core | A v2-only primitive that did not exist a year ago; using it is proof of reading the current SDK. |
| 7 | **Settlement on EMA, not spot.** Mark the NAV band on `ema_price` and show spot beside it. | `PriceUpdateV2.ema_price` at offset 109 | Core | It is four fields past where our decoder stops and free in the same account read. Pyth recommends EMA for settlement explicitly. |
| 8 | **Issuer fee dashboard across a whole launchpad.** Claimed/unclaimed/lifetime fees for every pool on a config, split partner vs creator. | `getPoolFeeBreakdown`, `getPoolsFeesByConfig`, `getPoolsFeesByCreator` | Core | Three untouched state reads that only make sense to someone running a launchpad, which is the "issuer tooling" the track names. |
| 9 | **Pre-IPO NAV where no oracle exists.** Already shipped: Tessera marks three private companies Pyth cannot reach on-chain. | Tessera `token-details` + the band | Core | The gap is real and checkable — `Equity.Index.OPENAI/USD` is absent from every push-oracle shard. |
| 10 | **Locked creator vesting with a cliff.** Team allocation that unlocks from migration time, via the Locker program. | `LockedVestingParams` + `migration.createLocker` | Core | Turns "trust the creator" into an on-chain schedule; the whole path is untouched here. |

## Tier 2 — the sponsor tech is the engine (11–22)

| # | Feature | Capability | Depth |
|---|---|---|---|
| 11 | Depth chart drawn from real quotes across 12 sizes, per preset | `swapQuote` sampled logarithmically | Core |
| 12 | Controlled preset comparison — all four curves quoted against one identical config | `getQuoteFromInputAmount` + `buildCurve*` ×4 | Core |
| 13 | Referral links that actually pay: 4% of the trading fee to the referrer | `referralTokenAccount` on `swap2` | Core |
| 14 | Anti-snipe launch: partner and creator first buys inside the pool-creation tx | `createPoolWithPartnerAndCreatorFirstBuy` | Core |
| 15 | Surplus withdrawal UI after graduation, for both roles | `partnerWithdrawSurplus` / `creatorWithdrawSurplus` | Core |
| 16 | Leftover reclaim after migration, permissionless caller | `migration.withdrawLeftover` | Core |
| 17 | On-chain partner and pool metadata so Juno pools are identifiable in any explorer | `createPartnerMetadata`, `createPoolMetadata` | Core |
| 18 | Migration fee with a configurable partner/creator split | `MigrationFee { feePercentage, creatorFeePercentage }` | Core |
| 19 | LP vesting after graduation — drip liquidity out over up to 2 years | `partnerLiquidityVestingInfo` / `creatorLiquidityVestingInfo` | Core |
| 20 | Partial-fill swaps: take what the curve can give rather than failing | `SwapMode.PartialFill` | Core |
| 21 | Hand a market over — transfer creator rights and fee claims | `transferPoolCreator` | Core |
| 22 | xStock vs underlying spread monitor (`Crypto.AAPLX/USD` vs `Equity.US.AAPL/USD`) | Two Pyth feeds, one comparison | Core |

## Tier 3 — genuinely built on it, but a thinner layer (23–35)

| # | Feature | Capability | Depth |
|---|---|---|---|
| 23 | Fee-schedule simulator: what a creator earns at a given volume under linear vs exponential | `FeeScheduler` class + `getFeeOnAmount` | Deep |
| 24 | Graduation simulator — SOL required to graduate from right here | `getPoolMigrationQuoteThreshold` + curve math | Deep |
| 25 | Curve progress from both sides, quote and base | `getPoolQuoteTokenCurveProgress` / `…BaseTokenCurveProgress` | Surface |
| 26 | Tokenomics breakdown per preset (supply on migration, leftover) | `getTokenomics`, `getCurveBreakdown` | Deep |
| 27 | Pool-creation fee as a launchpad revenue line, 90/10 split | `poolCreationFee` + `claimPartnerPoolCreationFee` | Deep |
| 28 | "Is this mint quotable?" checker for any token | `state.getTokenBadge` | Surface |
| 29 | First-swap-min-fee launches for fairer opens | `enableFirstSwapWithMinFee` | Deep |
| 30 | Compounding fee mode on the migrated pool | `MigratedCollectFeeMode.Compounding` | Deep |
| 31 | Dutch-auction preset via a custom sqrt-price curve | `buildCurveWithCustomSqrtPrices` | Deep |
| 32 | Two-segment quick-launch mode for simple markets | `buildCurveWithTwoSegments` | Deep |
| 33 | Mid-price curve targeting a Pyth or Tessera reference | `buildCurveWithMidPrice` + a mark | Deep |
| 34 | Market-cap-targeted curve builder in the launch form | `buildCurveWithMarketCap` | Deep |
| 35 | Multi-shard Pyth reads beyond 0 and 1, taking the freshest | `priceAccountFor` across more shards | Deep |

## Tier 4 — the sponsor is the data source, the feature is ours (36–44)

| # | Feature | Capability | Depth |
|---|---|---|---|
| 36 | Tessera float and share-of-company figures on a coin page | `markValuation` ÷ `latest_supply` | Surface |
| 37 | T-token risk disclosure read from the mint, not the docs | `tesseraOnChain` (already built) | Deep |
| 38 | Basket index across all three T-tokens, weighted by valuation | Tessera `token-details` | Surface |
| 39 | Alert when a curve's implied valuation crosses Tessera's mark | Tessera + the existing alert table | Deep |
| 40 | 24/7 vs exchange-hours labelling driven by feed metadata | Pyth `market_hours` from the free catalogue | Surface |
| 41 | Stale-mark banner using `prev_publish_time` to show the gap between ticks | `PriceUpdateV2.prev_publish_time` | Deep |
| 42 | Publisher-count quality badge per feed | `min_publishers` from the free Pro symbols endpoint | Surface |
| 43 | Ondo-vs-xStock-vs-underlying triple comparison for one ticker | Three Pyth feeds | Surface |
| 44 | Equity feed catalogue browser — 1,047 `Equity.US.*` names, searchable | Hermes `/v2/price_feeds` (free) | Surface |

## Tier 5 — swappable; the sponsor's name is on it but anything would do (45–50)

| # | Feature | Why it ranks last |
|---|---|---|
| 45 | Price sparkline on a coin card | Any price source would serve |
| 46 | "Top movers" list across referenced markets | Generic ranking over prices |
| 47 | Currency toggle (USD / SOL / quote token) | Arithmetic, not integration |
| 48 | Push notification when a mark moves 5% | Any feed triggers this |
| 49 | Share card with the current mark rendered in | Cosmetic use of a number |
| 50 | Clawpump-sourced quote-asset catalogue | Their `/api/pump-pairs` is convenient, but the same 170 mints are readable from the chain — the dependency is avoidable, which is exactly what makes it a checkbox |

---

## What I would actually build next, in order

1. **#1 — the stock-quoted curve.** It is the Meteora track's literal ask, the
   badges already exist, and no other entrant is likely to have found them.
2. **#2 — SpaceX priced by Pyth and Tessera at once.** One screen that wins
   attention on two tracks, using data nobody else has both halves of.
3. **#5 and #7 — confidence and EMA.** Both are free bytes in an account we
   already read, and both are things Pyth's own docs ask for.
4. **#3 — exact-out.** Small, visible, and the kind of thing that separates
   reading the SDK from copying a tutorial.

**Do not build:** anything PreStocks (it would forfeit Tessera), and anything
that invents an autonomous agent to qualify for Clawpump.
