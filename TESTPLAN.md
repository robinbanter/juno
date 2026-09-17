# Juno — test plan

Every item states what **correct** means before it is tested. A pass requires
the observed result to match that statement exactly, with a clean console and
no failed network requests.

**Final result: 70 of 71 PASS, 1 UNTESTED (credential-blocked).**
Verified in a real Chrome against the running app, with console and network
capture on every item. Re-run top to bottom after the last fix — all green.

Cluster: devnet. Base URL: `http://localhost:3000`.

Known fixtures on devnet:
- `AAPL` = `CMjWQU2Bzd1NWwy1GB2qFNcpgRtW6xm9dhcjnevtBcbp` (ipo-book, USDC)
- `NVDA` = `6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69` (thin-name, SOL)
- `TSLA` = `D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F` (tight-nav, USDC, IPFS)
- `GRAD` = `HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9` (content, **graduated**)
- Creator wallet = `9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE`

---

## A. Global shell

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | Header brand lockup | Gas-giant mark + "juno" wordmark, top-left, links to `/explore` | PASS |
| A2 | Header search | Centred pill; submitting "AAPL" navigates to `/explore?q=AAPL` | PASS |
| A3 | Connect button | Renders "Connect"; opens the wallet-adapter modal listing Phantom/Solflare | PASS |
| A4 | Side rail (≥lg) | Home/Reels/Trending/Create/Activity icons, each a distinct glyph, all resolve 200 | PASS |
| A5 | Rail active state | Current route's icon has a raised background | PASS |
| A6 | Mobile nav (<lg) | Bottom bar visible at 402px; side rail hidden | PASS |
| A7 | Get-the-App card | Renders a **scannable** QR (real encoder, not noise); dismiss removes it; absent on `/coin/*` and `/reels` | PASS |
| A8 | Theme scope | Juno routes are dark (`#0d0b12`); Norr's 18+ gate never appears on any Juno route | PASS |

## B. `/explore`

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Default list | Lists exactly the 4 devnet pools, newest first, each with real market cap from chain | PASS |
| B2 | Tile figures | AAPL shows `$1k` MC; NVDA shows a **SOL-denominated** cap (not `$`) | PASS |
| B3 | Reel badge | Only `format = reel` tiles show the badge; none currently, so none shown | PASS |
| B4 | Trending sort | `?sort=trending` reorders by 24h volume; unknown-volume pools sort last, not as zero | PASS |
| B5 | Search hit | `?q=AAPL` returns only AAPLx, heading reads `1 result for "AAPL"` | PASS |
| B6 | Search miss | `?q=zzzz` shows `Nothing matches "zzzz"`, no crash | PASS |
| B7 | Tile navigation | Clicking a post tile opens `/coin/<mint>` | PASS |
| B8 | Empty state | With zero pools, shows "No coins yet on devnet" + a Launch CTA (verified by query, not by deleting data) | PASS |

## C. `/coin/[address]`

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Header | Creator wallet short-form, holders count or nothing (never a false `0`) | PASS |
| C2 | Title + description | Exactly the values recorded at launch | PASS |
| C3 | Stat block | Market Cap from chain; 24H Volume renders `—`; Creator Rewards a real figure | PASS |
| C4 | Curve bar | Raised and threshold match a direct SDK read of the same pool to 2dp | PASS |
| C5 | Graduated pool | GRAD shows the graduated notice **instead of** a curve bar | PASS |
| C6 | Explorer links | Pool/Mint/Config/Launch tx/Meteora all present and resolve to the right addresses | PASS |
| C7 | Trade panel default | Quote token defaults to the **pool's own** mint (USDC for AAPL, SOL for NVDA) | PASS |
| C8 | Buy quote | Typing an amount produces a non-zero estimate from the real DBC quoter | PASS |
| C9 | Sell mode | Presets switch to 25/50/75/Max; input labelled in the coin, not dollars | PASS |
| C10 | Disconnected CTA | Reads "Buy" (not "Insufficient balance") with no wallet connected | PASS |
| C11 | Tabs | Activity/Holders/Comments/Details all switch; arrow keys move between them | PASS |
| C12 | Activity rows | Real signatures linking to Solscan; no fabricated size/direction | PASS |
| C13 | Details tab | Curve preset, addresses, threshold, progress, all matching chain | PASS |
| C14 | Creator panel | Hidden when disconnected (it is creator-only) | PASS |
| C15 | Unknown mint | `/coin/<valid-but-unregistered>` renders not-found, never fake data | PASS |
| C16 | Malformed mint | `/coin/abc` renders not-found without a server exception | PASS |

## D. `/reels`

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | Empty state | No reel-format pools exist → "No reels yet" + Create CTA | PASS |
| D2 | No console errors | Empty state renders without a video element or media error | PASS |

## E. `/creator/[handle]`

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | Real creator | Creator wallet shows 4 pools under Posts, aggregate MC | PASS |
| E2 | Tabs | Posts populated; Reels/Collected/Activity show honest empty states | PASS |
| E3 | Invalid handle | `/creator/notawallet` → not-found, no exception | PASS |

## F. `/create`

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | Format toggle | Post/Reel switches; Reel changes the upload frame to 9:16 | PASS |
| F2 | Curve picker | All 4 presets listed with real fee ranges; selecting one updates the rationale | PASS |
| F3 | Ticker input | Lowercase input is uppercased; symbols stripped | PASS |
| F4 | Valuation guard | migration ≤ initial shows the error and disables submit | PASS |
| F5 | Summary | Reflects live selections (format, curve, quote, valuations) | PASS |
| F6 | Disconnected CTA | Reads "Connect wallet to launch" | PASS |
| F7 | Media upload | Selecting a real image uploads to Pinata and previews it; CID shown | PASS |
| F8 | Upload rejection | A non-image/video file is rejected with a stated reason | PASS |

## G. API endpoints

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | `GET /api/juno/pools` | 200, JSON array of 4 devnet rows | PASS |
| G2 | `POST /api/juno/pools` valid | 201 and a persisted row | PASS |
| G3 | `POST` bad address | 400 `is not an address` | PASS |
| G4 | `POST` unknown pool | 404 `No such pool on this cluster` | PASS |
| G5 | `POST` creator mismatch | 400 — chain is authoritative over the client's claim | PASS |
| G6 | `POST` bad preset | 400 `Unknown curve preset` | PASS |
| G7 | `POST` non-JSON | 400, not a 500 | PASS |
| G8 | `POST /api/juno/metadata` | 201 with cid/uri/url; JSON fetchable from the gateway | PASS |
| G9 | `POST /api/juno/metadata` no name | 400 | PASS |
| G10 | `POST /api/juno/upload` no file | 400 `No file` | PASS |
| G11 | `POST /api/juno/upload` wrong type | 415 | PASS |
| G12 | `POST /api/juno/upload` real image | 201 with a working gateway URL | PASS |

## H. On-chain (verified against devnet, not mocked)

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | Pool read | `fetchPoolSnapshot` returns price/progress/threshold matching Solscan | PASS |
| H2 | Quote | `quoteTrade` returns non-zero out, fee, impact | PASS |
| H3 | Launch | 2-tx path both under 1232 bytes for all 4 presets | PASS |
| H4 | Swap | A signed buy confirms and moves curve progress | PASS |
| H5 | Partial fill | `swap2`/PartialFill completes a curve exact-in cannot | PASS |
| H6 | Fee claim | `claimCreatorTradingFee` moves the balance to zero | PASS |
| H7 | Migration | `migrateToDammV2` yields a real DAMM v2 account | PASS |
| H8 | Token metadata | Mint's Metaplex account carries the `ipfs://` URI | PASS |

## I. External integrations

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | Pinata auth | `testAuthentication` 200 | PASS |
| I2 | Pinata pin + fetch | Pinned JSON retrievable from the gateway | PASS |
| I3 | Postgres | Rows persist across a server restart | PASS |
| I4 | MongoDB | Connects; driver installed | PASS |
| I5 | Pyth | **Untestable** — Hermes price endpoints require a key not present in the repo | **UNTESTED** |
| I6 | Solana RPC | Reads succeed; note any 429s from the public endpoint | PASS |


---

## Fixes made during this run

| Item | Root cause | Fix |
|---|---|---|
| A4b, A5 | `SideRail` and `MobileNav` both used `aria-label="Primary"` — two identical landmarks, and both marked a tab active | Relabelled the mobile bar `Primary mobile` |
| A6-console | Duplicate React keys: `ITEMS` already had `/create`, and the disconnected profile slot appended `/create` again | Disconnected slot now opens the wallet modal instead of duplicating a tab |
| A-console | Public devnet RPC 429s. One `/explore` render made ~24 calls; web3.js then retried each 4× with backoff, logging every attempt | Cached immutable pool configs and mint decimals; derived curve progress from data already held instead of two more round trips; bounded hydration concurrency; `disableRetryOnRateLimit` so an already-handled failure fails fast instead of spamming |
| A-console | `pg` warned that `sslmode` aliases change meaning in v9 | Strip `sslmode` from the connection string; the explicit `ssl` object already decides policy |
| C-console | **Uncaught `Virtual pool is completed`** — the trade panel rendered on a graduated pool and the quoter threw, because a migrated curve cannot be swapped | Graduated pools now render `GraduatedNotice` with a derived DAMM v2 link instead of a trade panel |
| C-console | Client-side 429: the trade panel read the pool on mount for every visitor, most of whom never trade | Snapshot is fetched lazily on the first quote, and invalidated after a trade |

Harness defects found and corrected (not app bugs): `clean()` drains its
buffer, so calling it twice in one assertion reported an empty list; a real
`qrcode` SVG has a white background path plus one data path, so the shape count
was the wrong assertion; `networkidle` never settles against a dev server
because of the HMR socket.

## Confirmation

- **Zero mocks, stubs, fakes or TODOs** in `lib/juno`, `components/juno`,
  `app/(juno)` or `app/api/juno` — verified by grep. `lib/juno/mock.ts` is
  deleted.
- **Zero console errors and zero failed requests** across every tested page,
  captured per item rather than sampled.
- Database is real Neon Postgres, rows verified to survive a server restart.
- On-chain actions are real signed transactions on devnet against the live DBC
  program; every figure the UI shows was cross-checked against a direct SDK read.
- Pinata is called with real credentials; uploaded media and pinned metadata
  were fetched back from the public gateway.

**I5 (Pyth NAV) is UNTESTED, not passed.** Hermes moved its price endpoints
behind an API key that does not exist in this repo. The client code is written
and feed ids are verified; the UI shows no NAV rather than a fabricated one.
