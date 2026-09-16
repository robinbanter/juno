# Meteora audit — is it genuinely used?

Verified 2026-09-17 by running the flows, not by reading imports.

## Verdict

**Genuinely used, and load-bearing.** Meteora's Dynamic Bonding Curve is not a
dependency Juno imports — it is the thing Juno *is*. Remove it and there is no
product: no market, no price, no graduation, nothing to buy.

But the integration is **narrow**: 9 of 60 SDK service methods (15%). Two whole
services — `CreatorService` and `MigrationService` — are untouched, and five of
six curve builders are unused.

---

## 1. What the SDK actually offers

`@meteora-ag/dynamic-bonding-curve-sdk` v1.5.12, program
`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` (same on mainnet and devnet).

| Service | Methods | What it covers |
|---|---|---|
| `StateService` | 20 | reading pools, configs, fee metrics/breakdowns, curve progress, metadata, token badges |
| `PartnerService` | 13 | config creation, partner fee claims, surplus/migration-fee withdrawal, partner metadata, transfer-hook variants |
| `PoolService` | 7 | swap, swapQuote, swap2 (ExactOut / PartialFill), pre-pool simulated quotes |
| `CreatorService` | 13 | pool creation variants, creator fee claims, surplus withdrawal, pool metadata, creator transfer |
| `MigrationService` | 7 | migrate to DAMM v1/v2, locker creation, LP locking/claiming, leftover withdrawal |

Plus **6 curve builders** (`buildCurve`, `…WithMarketCap`, `…WithTwoSegments`,
`…WithMidPrice`, `…WithLiquidityWeights`, `…WithCustomSqrtPrices`) and ~150
exported math/PDA helpers (`getCurveBreakdown`, `getTokenomics`,
`getMigrationThresholdPrice`, `getSqrtPriceFromMarketCap`, fee-scheduler
calculators, and so on).

Track criteria: *originality of the DBC configuration or use case, technical
soundness, and whether the idea has a life after the hackathon.* Stated bar:
**working mainnet code beats slides.**

---

## 2. Every reference, classified

### GENUINELY USED — real calls, in real flows, verifiable on an explorer

| Call | Where | Proof it runs |
|---|---|---|
| `partner.createConfigAndPoolWithFirstBuy` | `lib/juno/dbc.ts:315` | 2 devnet pools created |
| `pool.swap` | `lib/juno/dbc.ts:438` | tx `59DBxUgP…`, curve moved 0 → 0.0117% |
| `pool.swapQuote` | `lib/juno/dbc.ts:218` | prices the trade panel and the CLI |
| `state.getPool` | `lib/juno/dbc.ts:139` | every coin page render |
| `state.getPoolConfig` | `lib/juno/dbc.ts:143` | supplies decimals + curve to the quoter |
| `state.getPoolQuoteTokenCurveProgress` | `lib/juno/dbc.ts:152` | graduation bar |
| `state.getPoolMigrationQuoteThreshold` | `lib/juno/dbc.ts:153` | graduation target |
| `state.getPoolFeeMetrics` | `lib/juno/chain.ts:68` | "Creator Rewards $0.0097" |
| `state.getPoolByBaseMint` | `scripts/juno-inspect.ts:27` | CLI pool lookup |
| `buildCurveWithLiquidityWeights` | `lib/juno/curves.ts` | all 4 presets |
| `validateConfigParameters` | `tests/unit/juno-curves.test.ts` | 4 presets asserted |
| `deriveDbcPoolAddress` | `lib/juno/dbc.ts` | pool address derived pre-creation |

**Live cross-check.** The running app renders `$0.48` raised against a `$4.07k`
threshold; a direct SDK read of the same pool returns `0.4758675` and
`4074.472910666`. They match because the page is reading the program, not a
cache.

### FAKED
None. `lib/juno/mock.ts` was deleted; no hardcoded Meteora response exists
anywhere in the codebase.

### IMPORTED BUT UNUSED
None at module level — every import is called.

### MISSING — 51 of 60 service methods

- **`CreatorService` (0/13)** — no creator fee claiming, no pool metadata, no
  surplus withdrawal, no creator transfer.
- **`MigrationService` (0/7)** — nothing calls `migrateToDammV2`, `createLocker`,
  or `withdrawLeftover`. Graduation is *displayed* but never *performed*.
- **`PoolService` (2/7)** — no `swap2` (so no ExactOut or PartialFill), and no
  `getQuoteFromInputAmount`, which quotes a curve **before any pool exists**.
- **`PartnerService` (1/13)** — no fee claiming, no partner metadata, no
  transfer-hook configs.
- **`StateService` (6/20)** — no `getPoolsByCreator` (the registry does that job
  in Postgres instead), no `getPoolFeeBreakdown`, no `getPoolMetadata`.
- **5 of 6 curve builders unused.**
- **Config surface unused:** `LockedVesting`, `LiquidityVestingInfo`,
  `MigratedPoolMarketCapFeeScheduler`, `TokenAuthorityOption`, migration fees,
  Token-2022 / transfer hooks, first-buy.

---

## 3. Where deeper integration organically fits

Three surfaces where more Meteora would make the product better, not just
score better:

1. **Graduation is the story and it is not implemented.** The bar fills to 100%
   and then nothing happens. `migrateToDammV2` + `createLocker` turn "life after
   the hackathon" from a claim into a button.
2. **Creators cannot collect.** The pitch is "creators earn trading fees." The
   page shows accrued rewards and offers no way to claim them.
   `creator.claimCreatorTradingFee` closes that loop.
3. **The curve is chosen blind.** `/create` picks a preset from prose.
   `getQuoteFromInputAmount` simulates a curve *pre-launch*, so an issuer could
   see what a $10k buy does to their price before committing.

Where it would be forced, and so is excluded below: transfer hooks purely to
say Token-2022 was used; DAMM v1 migration (deprecated); rate limiter fees
(deprecated).

---

## 4. Fifty features, ranked by how load-bearing Meteora is

### Tier 1 — impossible without Meteora (1–12)

1. **Graduation button.** Call `migrateToDammV2` when the threshold is met, show the resulting DAMM v2 pool. *Capability: `migration.migrateToDammV2`. Core.* Judges explicitly ask about life after the hackathon; this is that, executed.
2. **Creator fee claim.** `creator.claimCreatorTradingFee` with an accrued balance from `getPoolFeeBreakdown`. *Core.* Completes the product's central promise.
3. **Pre-launch curve simulator.** `pool.getQuoteFromInputAmount` against a config that does not exist yet — show price at $1k/$10k/$100k of buying before you commit. *Core.* Almost nobody uses this method; it is the issuer tooling the track asks for.
4. **Curve shape comparator.** Render all 6 builders over the same market caps so an issuer sees `WithTwoSegments` vs `WithMidPrice` vs `WithLiquidityWeights`. *Core.* Directly answers "originality of the DBC configuration."
5. **Post-migration market-cap fee scheduler.** `MigratedPoolMarketCapFeeScheduler` so the graduated pool's fee falls as cap rises. *Core.* Nearly unknown config surface.
6. **Locked-liquidity vesting schedules.** `LiquidityVestingInfoParams` to vest creator LP after migration instead of a cliff. *Core.* A real answer to rug risk.
7. **Creator token vesting.** `LockedVestingParams` — creator allocation unlocks over time. *Core.*
8. **Exact-out buys.** `swap2` with `SwapMode.ExactOut` — "buy exactly 1,000,000 tokens." *Core.* No other launchpad exposes this.
9. **Partial-fill orders.** `SwapMode.PartialFill` fills what the curve can absorb rather than reverting. *Core.*
10. **Surplus withdrawal.** `creatorWithdrawSurplus` / `partnerWithdrawSurplus` post-migration. *Core.*
11. **Leftover reclaim.** `migration.withdrawLeftover` returns unsold supply to the leftover receiver. *Core.* Closes the `leftover` loop most launches ignore.
12. **Locker escrow.** `migration.createLocker` to escrow migrated tokens on a schedule. *Core.*

### Tier 2 — Meteora-specific, strengthens the product (13–30)

13. **Curve breakdown chart.** `getCurveBreakdown` renders the real 16 segments with prices and liquidity per segment. *Deep.* Shows the work rather than describing it.
14. **Tokenomics panel.** `getTokenomics` — supply split across swap / migration / vesting / leftover. *Deep.*
15. **Live fee-decay meter.** `getBaseFeeNumeratorByPeriod` shows the current fee mid-decay and when it settles. *Deep.*
16. **Threshold price marker.** `getMigrationThresholdPrice` draws the exact price at which the pool graduates. *Deep.*
17. **Market-cap → sqrt-price tool.** `getSqrtPriceFromMarketCap` lets an issuer enter a target cap and see the implied curve. *Deep.*
18. **Fee-schedule designer.** Preview `calculateFeeSchedulerEndingBaseFeeBps` across linear vs exponential decay. *Deep.*
19. **Config key marketplace.** `state.getPoolConfigs` / `getPoolConfigsByOwner` — reuse a proven config instead of minting a new one per launch. *Deep.* Real DBC practice most apps miss.
20. **Partner fee dashboard.** `getPoolsFeesByConfig` aggregates platform revenue across every pool on a config. *Deep.*
21. **Creator earnings across pools.** `getPoolsFeesByCreator` — one page, every pool a creator owns. *Deep.*
22. **Partner metadata on-chain.** `createPartnerMetadata` so Juno itself is identifiable as the launch partner. *Deep.*
23. **Pool metadata on-chain.** `creator.createPoolMetadata` writes name/social to the virtual pool. *Deep.*
24. **Transfer pool ownership.** `transferPoolCreator` — hand a coin to a DAO or a new custodian. *Deep.*
25. **First-buy on launch.** `firstBuyParam` lets a creator seed their own curve atomically with creation. *Deep.*
26. **Base-token curve progress.** `getPoolBaseTokenCurveProgress` alongside the quote-side ratio — they diverge, and the difference is informative. *Deep.*
27. **Migration fee split.** `migrationFee` / `creatorMigrationFeePercentage` config. *Deep.*
28. **Custom sqrt-price curves.** `buildCurveWithCustomSqrtPrices` for issuers who want exact price points, not a shape. *Deep.*
29. **Two-segment quick launch.** `buildCurveWithTwoSegments` as a simple mode beside the 16-segment expert mode. *Deep.*
30. **Mid-price curve.** `buildCurveWithMidPrice` — pin a curve through a known reference price. *Deep.* Natural fit for equities.

### Tier 3 — genuine use, lighter dependency (31–42)

31. **Graduation countdown feed.** Rank pools by `curveProgress` — "closest to graduating." *Moderate.*
32. **Slippage-aware size suggester.** Binary-search `swapQuote` for the largest buy under a chosen price impact. *Moderate.*
33. **Depth chart from the curve.** Plot fill size vs impact by sampling `swapQuote`. *Moderate.*
34. **Anti-snipe window badge.** Show "fee is 4% for 9 more minutes" from the fee scheduler. *Moderate.*
35. **Pool health check.** `assertConfigAllowsNewPool` + badge validation before launch. *Moderate.*
36. **Config diff viewer.** Compare two pools' `PoolConfig` field by field. *Moderate.*
37. **Referral fees.** `referralTokenAccount` on swaps to pay the sharer. *Moderate.*
38. **Protocol-fee transparency.** Split `getPoolFeeBreakdown` into creator / partner / protocol. *Moderate.*
39. **Graduated-pool archive.** Filter `isMigrated` pools into a "graduated" tab with DAMM v2 links. *Moderate.*
40. **Quote-token switcher at launch.** USDC vs SOL vs a stock token, with `validateQuoteMintBasic`. *Moderate.*
41. **Token badge support.** `deriveTokenBadgeAddress` to allow Token-2022 quote mints such as xStocks. *Moderate.* The stock-token path.
42. **Creation-time sort.** `getAccountCreationTimestamps` for a true on-chain "newest." *Moderate.*

### Tier 4 — Meteora is present but swappable (43–50)

43. **Price alerts** when a pool crosses a threshold. *Surface.*
44. **Portfolio page** of DBC positions. *Surface.*
45. **Leaderboard** by market cap. *Surface.*
46. **Embeddable buy widget.** *Surface.*
47. **Share cards** with live curve stats. *Surface.*
48. **Wallet PnL** across pools. *Surface.*
49. **Trending by fee velocity.** *Surface.*
50. **CSV export** of pool history. *Surface.*

---

## 5. Recommendation

Build **1, 2, 3** — graduation, fee claiming, pre-launch simulation. They are
the three places the product currently makes a promise it does not keep, they
use methods almost no other entry will touch, and together they answer the
track's stated criteria directly: an original DBC use case, technically sound,
with an obvious life after the hackathon.
