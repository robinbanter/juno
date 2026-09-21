# Juno — 100 ideas, run 3

`IDEAS.md` is the previous run's list and is stale: a dozen of its "not
reached" items shipped afterwards (price history, portfolio, P&L, the Pyth NAV
band, mobile sheets, 404s). Nothing below repeats anything that exists today.

**What exists now:** 6 web routes, 13 API endpoints, 8 native screens, 2
Postgres tables (`juno_pools`, `juno_posts`), 4 curve presets, launch → trade →
graduate → claim, Pyth NAV on-chain, swap decoding without an indexer,
average-cost portfolio with P&L, a ruled design system.

**The thesis this list commits to.** Juno is currently a *launchpad with a
feed*. Every launchpad at this hackathon will be that. The gap in the product —
and the reason there are only two tables — is that nothing here helps you
**decide what to buy** or **keep buying it**. Turning it into a **social
trading and savings** app is the one change that makes the existing machinery
(decoded fills, cost basis, realised P&L, a curve that is legible) pay off, and
it is the direction judges can feel in thirty seconds.

Scored **impact × feasibility × fit**. Fit is weighted hardest: a pile of
disconnected features hurts a three-minute demo.

---

## Tier 1 — the thesis (build first)

| # | Idea | Why it wins |
|---|---|---|
| 1 | **Trader leaderboard** — rank wallets by realised P&L, from decoded fills | The portfolio engine already computes average cost and realised P&L per wallet. Nobody is ranked anywhere yet. One endpoint turns an existing engine into the app's headline screen. |
| 2 | **Follow a trader** — persisted, real table | The primitive every social-trading feature needs, and the app has no social graph at all. |
| 3 | **Following-only feed** — filter the ledger to people you follow | Makes the follow mean something the moment it is made. |
| 4 | **Copy a position** — one tap to buy what a trader holds, at your own size | The literal definition of social trading, built entirely on the existing server-builds/device-signs path. |
| 5 | **Watchlist** — star a coin, persisted | The savings half's entry point; also the cheapest possible "come back tomorrow" hook. |
| 6 | **Recurring buy plan** — an amount and a cadence, stored, with one-tap execute | The savings headline. Honest version: the plan persists and tells you when it is due; execution is a real signed swap, because a wallet that signs for you needs a delegate this project does not have. |
| 7 | **Social proof strip** on a coin — unique traders, first buyer, net flow this week | Turns a price into a crowd. All three numbers come from fills already decoded. |
| 8 | **Price-impact size suggester** — largest buy under a chosen impact, binary-searched over `swapQuote` | Real issuer/trader tooling, pure DBC math, and the kind of thing that reads as "they understood the curve". |

## Tier 2 — social trading depth

9. Trader profile: win rate, average hold time, best and worst exit
10. "Smart money" tag — wallets with more than N profitable exits
11. First-buyer badge on a coin, with the price they got
12. Copied-N-times counter on a trader
13. Attach a note to a buy; it appears in the feed as a post
14. Reply thread on a specific fill, not just on a post
15. Conviction metric — share of a wallet's portfolio in one coin
16. Overlap view — coins you and a trader both hold
17. Head-to-head P&L on the same coin between two wallets
18. Net buy/sell pressure over the last hour, per coin
19. Streaks — consecutive profitable exits
20. Public trade receipt: a permalink per fill carrying its signature
21. Creator vs trader badge (launched it / only traded it)
22. "Bought before graduation" badge
23. Follower count on a creator page (real, not a fabricated zero)
24. Mutual-follow indicator
25. Trader search by address prefix

## Tier 3 — savings and accumulation

26. Price alert when a watched coin crosses a level
27. Plan progress — contributed vs target, as a ruled bar
28. Savings goal with a target value and a projected date
29. Round-up: after a buy, offer to top it to the next whole unit
30. Basket buy — one flow across several coins
31. Auto-allocate to graduated pools only (the safer basket)
32. Cost-basis ladder: average cost against current, per lot
33. Buy-the-dip alert when price falls X% below your average
34. Hold-time per position
35. Realised vs unrealised split on the profile
36. Allocation ring by curve preset
37. Contribution history as its own ledger
38. Savings streak — days with a contribution
39. Withdraw planner: what selling N% realises
40. Tax-lot CSV export

## Tier 4 — deeper Meteora (the bounty)

41. Depth chart sampled from `swapQuote` across sizes
42. Exact-out buys (`SwapMode.ExactOut`) — "buy exactly 1M tokens"
43. Partner metadata on-chain (`createPartnerMetadata`) so Juno is identifiable
44. Pool metadata on-chain (`createPoolMetadata`)
45. Surplus withdrawal UI after migration
46. Leftover reclaim (`withdrawLeftover`)
47. Creator token vesting (`LockedVestingParams`)
48. First-buy at launch — creator seeds their own curve in the same flow
49. Launch onto an existing proven config
50. Migration fee split configuration
51. Locker creation for migrated tokens
52. Referral fees on swaps
53. Two-segment quick-launch mode
54. Custom sqrt-price curve builder
55. Dutch-auction preset
56. Mid-price curve targeting the Pyth reference
57. Fee simulator — what a creator earns at a given volume
58. Graduation simulator — SOL required to graduate from here
59. Curve diff — two presets on the same axis with real numbers
60. Post-migration market-cap fee scheduler

## Tier 5 — design and motion

61. Number roll on any figure that changes between reads
62. Curve fill that advances as progress rises
63. Trade confirmation that visibly moves the graduation bar
64. Shared-element transition from ledger entry to coin screen
65. Sparkline per ledger entry, from that pool's own fills
66. Delta flash — brief tint when a price changes between polls
67. Pull-to-refresh whose spinner is the curve
68. Long-press a ledger entry for a quick-trade peek
69. Swipe a ledger entry to watchlist
70. Drag the candle chart to scrub the OHLC readout
71. Tab-bar badge when the feed has something new
72. Ledger row that expands in place instead of navigating
73. Sticky column headers on a long ledger
74. Curve preset picker as a physical dial
75. Onboarding that launches a real coin in three taps
76. "Last read" pulse showing data freshness
77. Skeleton-to-content crossfade instead of a swap
78. Buy and sell haptics distinct from each other
79. Empty states that teach the first action rather than state a fact
80. A single authored motion moment per screen, not per element

## Tier 6 — production readiness

81. Toast system for the transaction lifecycle, with explorer links
82. Network mismatch warning (wallet on mainnet, app on devnet)
83. Stale-quote detection and automatic re-quote
84. Insufficient-SOL-for-rent pre-check before a launch
85. Duplicate-ticker warning at launch
86. Unsaved-changes guard on the launch form
87. Wallet disconnected mid-flow, handled
88. Program errors decoded to human sentences
89. Offline banner when the RPC is unreachable
90. A request queue that respects the endpoint's rate limit
91. Optimistic posting with rollback
92. Idempotent launch recovery (config landed, pool did not)
93. Deep link for every entity, on both surfaces
94. OG images per coin, with live curve stats
95. Public read API with documentation
96. Health endpoint reporting cluster and RPC state
97. Seed script that rebuilds a demo cluster from nothing
98. E2E smoke test in CI
99. Demo mode — a guided sixty-second tour
100. Data-freshness contract shown per figure ("read 4s ago")

---

## Build order

1 → 2 → 3 → 5 → 7 → 6 → 4 → 8, then Tier 4's 41/42, then Tier 6's 81.

The first eight are one coherent story — *find a trader, follow them, see what
they buy, copy it, keep buying* — rather than eight separate features. That is
the point of ranking by fit.

## Disposition

"Not reached" is said plainly rather than dressed up as a decision.

### Built and verified on a real device against devnet

| # | What | How it was verified |
|---|---|---|
| 1 | Trader leaderboard | `/api/juno/leaderboard` 200 in 21.6s, `partial: true`, `poolsRead: 8`; board rendered on device with its own "ranked from N pools" caveat |
| 2 | Follow a trader | New `app/trader/[wallet]` screen. Tapped Follow on device; `followers` went 0 → 1 in Postgres and the button became "Following" |
| 3 | Following-only feed | Server-side filter. `?following=<wallet>` returned 12 of 13 items, correctly dropping the viewer's own; switch verified on device |
| 4 | Copy a position | "Buy this yourself" on every holding of a trader, opening the ordinary buy sheet at your size |
| 5 | Watchlist | Watch toggle in the coin nav; row written to Postgres; Watching tab renders it |
| 6 | Recurring buy plan | Created through the sheet (0.02 SOL weekly, 0.08 target); contributed for real — devnet signature `2SChsaQvu…` — and `contributed`/`fills` advanced only after it landed |
| 7 | Social proof (`crowd`) | Endpoint returns 3 traders, 2 still holding, first buyer and their multiple, net flow over a day and a week. **No UI yet.** |
| 8 | Price-impact size suggester (`depth`) | 12-point depth curve and a binary search that lands at 0.9989% against a 1% budget. **No UI yet.** |
| 13 | A note attached to a buy | The buy sheet's comment box. Stored with the side and the signature; `notesForSignatures` proven to return it for a real landed fill |
| 23 | Follower count, real | On the trader screen, from Postgres |
| 26 | Price alert on a watched coin | Alert sheet; direction derived from the price when it was set; "Crossed" pill verified |
| 27 | Plan progress vs target | Ruled bar, zero draws nothing |
| 41 | Depth chart | `sampleDepth`, 12 log-spaced points. **No UI yet.** |
| 42 | — | Exact-out not reached |
| 88 | Program errors as sentences | `explainSubmitFailure`; verified live — an expired blockhash now says so instead of "something went wrong on our side" |
| 93 | Deep links | Every tab and segment is addressable, and re-addressable on an already-mounted screen |

### Also built, outside the original hundred

The seven UI changes asked for mid-run: the chart as the hero of the coin
screen, four tabs, comments as a bottom drawer, the buy sheet rebuilt, a
media-forward feed card, trade announcements, and the details table.

### Not reached

Everything else. Tiers 2, 3, 5 and 6 are almost entirely untouched, and the
Meteora depth of Tier 4 stops at 41. The reason is the one this document
already predicted: the ranking was by fit, the first eight are one story, and
telling that story properly — with every figure read from somewhere — took the
whole run. A shorter honest list.
