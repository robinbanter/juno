# Juno — 100 ideas, ranked

Scored **impact × feasibility × fit**. Fit matters as much as the other two:
this is a demo a judge sees for three minutes alongside twenty others, and a
pile of disconnected features hurts as much as it helps.

What already exists (not repeated below): 6 routes, wallet connect, launch,
trade, creator fee claim, graduation to DAMM v2, IPFS metadata, Postgres
registry, 4 curve presets, partial-fill swaps.

---

## Built and verified this run

| # | Idea | Evidence |
|---|---|---|
| 1 | Curve shape visualiser | 16 segments plotted on every coin page; `ipo-book` reads as a U, `thin-name` decays |
| 3 | Preset comparison | All four curves on the `/create` picker, side by side |
| 4 | Animated curve fill | Draws on mount, honours `prefers-reduced-motion` |
| 6 | Comments on MongoDB | Posted, persisted, read back; validation 400/404 |
| 8 | Fee-decay meter | Live: "4.00% at launch → 0.50%", current 0.50%, from the program's own scheduler |
| 9 | Tokenomics breakdown | 82.5% curve / 16.5% migration / 1.0% leftover, off-chain config |
| 14 | Reel seeding | 3 reel-format pools launched, video pinned to IPFS, decoding at 480x854 |

Production fixes forced by real-browser testing: lazy video mounting (three
simultaneous loads were aborting), IntersectionObserver picking the most
visible reel rather than the last to fire, and clamped easing (a negative
eased value reaches SVG as a negative rect width and throws).

## Tier 1 — build first (1–14)

| # | Idea | Why it wins |
|---|---|---|
| 1 | **Curve shape visualiser** — plot the real 16 segments from `getCurveBreakdown` on the coin page | The presets are the entire Meteora submission and are currently invisible. Nobody else will *show* their curve. |
| 2 | **Pre-launch curve simulator** in `/create` — `getQuoteFromInputAmount` against a config that does not exist yet | Quotes a curve before any pool exists. Almost nobody uses this method; it is literally the "issuer tooling" the track asks for. |
| 3 | **Preset comparison overlay** — all four curves on one axis | Makes "originality of the DBC configuration" self-evident in one glance. |
| 4 | **Animated curve fill** — the traded portion of the curve fills as progress rises | One memorable visual moment tied to real data. |
| 5 | **Live price/progress polling** on the coin page with animated number transitions | A demo where numbers move by themselves reads as alive. |
| 6 | **Comments** persisted in MongoDB, attached to trades | Credentials already exist and are unused; makes it a social app, not a launchpad. |
| 7 | **Impact-aware size suggester** — largest buy under a chosen price impact, binary-searched over `swapQuote` | Real trading tooling, pure DBC math. |
| 8 | **Fee-decay live meter** — current fee mid-decay via `getBaseFeeNumeratorByPeriod`, with a countdown | Shows the anti-snipe schedule actually working. |
| 9 | **Tokenomics breakdown** — `getTokenomics` supply split (curve / migration / leftover) | Answers "where do the tokens go" with the SDK's own numbers. |
| 10 | **Graduation countdown feed** on `/explore` — pools ranked by curve progress | Creates urgency and shows the lifecycle at a glance. |
| 11 | **Skeleton loaders** matching final layout on every async surface | The difference between "finished" and "loading spinner". |
| 12 | **Error boundaries** per route with a real retry | Judges break things. |
| 13 | **Toast system** for tx lifecycle (signing → sent → confirmed) with explorer links | Every on-chain action currently reports inline or not at all. |
| 14 | **Reel seeding** — launch reel-format pools so `/reels` is not empty in the demo | A headline feature currently shows an empty state. |

## Tier 2 — strong, build if time (15–34)

15. Depth chart sampled from `swapQuote` across sizes
16. Price history chart from swap signatures (replaces the "indexing" placeholder)
17. Holder distribution donut from `getTokenLargestAccounts`
18. Creator earnings dashboard across all their pools
19. Config-key reuse — launch onto an existing proven config
20. `/create` live preview card showing how the coin will look
21. Slippage control in the trade panel
22. Exact-out buys (`SwapMode.ExactOut`) — "buy exactly 1M tokens"
23. Share cards (OG images) with live curve stats
24. Trade confirmation animation — the curve bar visibly advancing
25. Wallet balance display in the header
26. Recent-trades ticker on `/explore`
27. Keyboard shortcuts (`/` search, `b` buy, `g` graduate)
28. Optimistic comment posting with rollback
29. Copy-address feedback everywhere, not just the coin page
30. `/coin` page open-graph metadata per coin
31. Migration ETA estimate from recent fill velocity
32. Curve preset badge on every tile
33. "Why this curve" explainer popover on each preset
34. Empty-state illustrations derived from the mint identicon

## Tier 3 — polish and production (35–62)

35. Route transitions with view-transitions API
36. Number roll animation on market cap changes
37. Haptic-style press feedback on primary buttons
38. Reduced-motion support honouring `prefers-reduced-motion`
39. Focus-visible audit across every interactive element
40. Scroll-restoration on the reels feed
41. Image lazy-loading with blur-up from the identicon
42. Retry with backoff on failed RPC reads
43. Offline banner when the RPC is unreachable
44. Rate-limit banner explaining degraded holder counts
45. Form validation messages inline, not just on submit
46. Unsaved-changes guard on `/create`
47. Duplicate-ticker warning at launch
48. Minimum-valuation guard with an explanation
49. Transaction-failed recovery UI with the actual program error
50. Wallet-disconnected mid-flow handling
51. Stale-quote detection (re-quote if older than N seconds)
52. Network mismatch warning (wallet on mainnet, app on devnet)
53. Insufficient-SOL-for-rent pre-check before launch
54. Pool-not-found page with a search box
55. 404 and 500 pages in Juno's own design
56. Loading bar on route change
57. Sticky trade panel on scroll
58. Mobile bottom-sheet trade panel
59. Pull-to-refresh on mobile feeds
60. Virtualised lists for large pool counts
61. Debounced search with URL sync
62. Accessible live-region announcements for trade status

## Tier 4 — deeper Meteora (63–78)

63. Partner metadata on-chain (`createPartnerMetadata`) so Juno is identifiable
64. Pool metadata on-chain (`createPoolMetadata`)
65. Surplus withdrawal UI post-migration
66. Leftover reclaim UI (`withdrawLeftover`)
67. Locker creation for migrated tokens
68. Liquidity vesting schedule configuration
69. Creator token vesting (`LockedVestingParams`)
70. Post-migration market-cap fee scheduler
71. Migration fee split configuration
72. Transfer pool ownership to another wallet
73. First-buy at launch (creator seeds own curve)
74. Custom sqrt-price curve builder
75. Two-segment quick-launch mode
76. Mid-price curve targeting a reference price
77. Referral fees on swaps
78. Token badge support for Token-2022 quote mints

## Tier 5 — stretch / lower fit (79–100)

79. Pyth NAV band *(blocked: no API key)*
80. NAV deviation warnings *(blocked: same)*
81. xStock quote-token support
82. PreStocks API integration
83. Tessera T-token integration
84. Clawpump stock-paired pools
85. Portfolio page across all holdings
86. PnL tracking per position
87. Watchlist with alerts
88. Push notifications on graduation
89. Embeddable buy widget
90. Public API for pool data
91. CSV export of trade history
92. Leaderboard by creator earnings
93. Follow system
94. Direct messages
95. Reel remixing / duets
96. Multi-sig creator accounts
97. DAO-owned pools
98. Scheduled launches
99. Dutch-auction curve preset
100. Cross-chain bridging

---

## Build order

1, 2, 3 first — they make the invisible differentiator visible.
Then 13, 11, 12 (production feel), 5/4 (motion on real data), 6 (Mongo), 8/9
(more SDK depth), 14 (fills the empty reels demo), 7, 10.

Deliberately skipped: 79–84 (credentials or different products), 93–100
(scope creep that would clutter a three-minute demo).
