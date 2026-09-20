# Juno — test plan

Written **before** testing, so it is a checklist rather than a description of
whatever happened to work. Every item states what *correct* means as a specific
observable result.

Run: 2026-09-21. Cluster: devnet. Server: `npm run dev` on :3000.
Mobile: Expo on the iPhone 17 simulator via `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

Status values: **PASS** · **FAIL** · **UNTESTABLE** (with the reason).

---

## A note on the two constraints this plan must respect

**A 503 is not a failure of the app.** Juno runs on the public devnet RPC by
decision (D13). When that endpoint refuses, the correct behaviour is a 503 with
a message saying the RPC is rate-limiting, and a retry affordance — not a 500,
not a fabricated number, not an empty state claiming "no coins". Items below
that touch chain reads are judged on *that* contract, and are re-run after a
pause before being marked FAIL.

**The mobile app cannot be driven by Chrome.** Expo runs natively. Those items
are executed on the iOS Simulator via `simctl` and are marked as such rather
than skipped.

---

## 1. Web pages (Chrome, localhost:3000)

| # | Item | Correct means |
|---|---|---|
| W1 | `/explore` loads | Grid of coin tiles, each with a name, ticker, preset badge and a market cap in a labelled currency. No console errors. |
| W2 | `/explore` with pools unreadable | Says the pools exist but could not be read, **not** "No coins yet". |
| W3 | `/explore` sort `?sort=trending` | Reorders without error; every tile still priced. |
| W4 | `/explore` search `?q=` | Filters tiles; a no-match query says nothing matches that query. |
| W5 | `/coin/[address]` loads | Media/glyph, name, ticker, preset, market cap, curve progress with real threshold, Buy/Sell present. |
| W6 | Coin page price chart | Toggling to the chart draws a line with ≥2 real trades, axis labels, endpoint label. One trade shows "one trade so far"; none shows "no trades yet". |
| W7 | Coin page NAV band | On an equity-preset coin with a feed: label, price, deviation, and state = live / market closed · last close / stale. Never implies a closed market is live. |
| W8 | Coin page activity | Rows show a real side (buy **and** sell both appear across the set), size, and time. No row asserts a side it did not read. |
| W9 | `/coin/<nonexistent>` | 404 page, not a crash. |
| W10 | `/reels` | Vertical feed of `format=reel` coins; empty state if none. |
| W11 | `/activity` | Global trade feed, newest first, or "Nothing has traded yet." |
| W12 | `/create` | Launch form with 4 presets; the curve shape renders. |
| W13 | `/creator/[wallet]` | Creator's launches; counters that are not real are absent or dashed, never fabricated zeros. |
| W14 | Light theme | Sage canvas, white cards, dark ink, lime/green actions across every route. No dark-theme leftovers except the reels video scrim. |

## 2. API endpoints (curl + Chrome network tab)

| # | Item | Correct means |
|---|---|---|
| A1 | `GET /api/juno/coins` | 200, `{cluster:"devnet", coins:[…]}`, each coin priced with a currency. |
| A2 | `GET /api/juno/coins?sort=marketCap` | 200, ordered by market cap descending. |
| A3 | `GET /api/juno/coins?sort=graduating` | 200, ordered by curve progress descending. |
| A4 | `GET /api/juno/coins/[mint]` | 200 with coin, activity, holders, launchSignature. `priceHistory` carries `price`, `volume`, `side`. |
| A5 | `GET /api/juno/coins/<bad>` | **404** `{"error":"Coin not found"}` — not 500. |
| A6 | `GET /api/juno/feed` | 200, items of kind `trade` and/or `post`, newest first. Post items carry `replyCount`. |
| A7 | `GET /api/juno/posts` | 200, top-level posts only (no replies leaking into the feed list). |
| A8 | `POST /api/juno/posts` | 201, row persists, readable back. |
| A9 | `POST /api/juno/posts` empty body | **400** `"A post needs a body"` — not 500. |
| A10 | `POST /api/juno/posts` over 500 chars | **400** with the length message. |
| A11 | `GET /api/juno/posts/[id]` | 200 with post, replies (oldest first), replyCount, and a live coin when the post names one. |
| A12 | `GET /api/juno/posts/<bad>` | **404** `"Post not found"`. |
| A13 | Reply flow | `POST` with `parentId` → 201 → parent's `replyCount` increments → reply appears in `replies`, **not** in the feed. |
| A14 | `GET /api/juno/portfolio/[wallet]` | 200 with positions, totalValue, history; `totalPnl` **null** when any holding has no recorded cost. |
| A15 | `GET /api/juno/portfolio/<bad>` | **400** `"Not a Solana address"` — not 500. |
| A16 | `POST /api/juno/tx/swap` | 200 with base64 tx under 1232 bytes, a quote, and a blockhash window. |
| A17 | `POST /api/juno/tx/swap` amount 0 | **400** `"Amount must be greater than zero"`. |
| A18 | `POST /api/juno/tx/swap` on graduated pool | **400** naming graduation, not a broken transaction. |
| A19 | `POST /api/juno/tx/launch` | 200 with **two** steps, each ≤1232 bytes, each pre-signed by its new account and missing only the payer. |
| A20 | `POST /api/juno/tx/launch` bad ticker | **400** with the symbol rule. |
| A21 | `POST /api/juno/tx/launch` unknown preset | **400** listing the valid presets. |
| A22 | `POST /api/juno/tx/submit` | Accepts a signed tx, confirms, returns a signature. |
| A23 | `GET /api/ipfs/[cid]` bad cid | **400** `"Not a content hash"`. |
| A24 | `GET /api/juno/pools` | 200, registry rows for this cluster only. |
| A25 | RPC-busy contract | Under throttling every chain-backed route returns **503** with the rate-limit message — never 500, never fabricated data. |
| A26 | CORS | Every `/api/juno/*` route answers `OPTIONS` with permissive CORS headers. |

## 3. On-chain (real network, no mocks)

| # | Item | Correct means |
|---|---|---|
| C1 | Swap transaction is signable and lands | Server-built bytes, signed locally, submitted, cluster confirms, `meta.err` null. |
| C2 | Launch splits into two packet-sized txs | Both ≤1232 bytes; config + mint pre-signed. |
| C3 | Swap decoding | Buys **and** sells both decode from vault deltas with exact amounts. |
| C4 | Non-trades excluded | Pool creation, fee claims and migration never appear as trades. |
| C5 | Pyth feeds | All 9 shipped feed ids resolve to real on-chain accounts with sane prices. |
| C6 | Pyth shard freshness | Crypto fresh on shard 0, equities on shard 1; the fresher is chosen. |
| C7 | Equity market hours | A weekend equity mark reports `closed`, not `live` and not `stale`. |
| C8 | Graduated pool rejects swaps | Build refuses with a graduation message. |
| C9 | Curve presets valid | All 4 pass Meteora's own `validateConfigParameters`. |

## 4. Mobile (iOS Simulator — not Chrome-testable)

| # | Item | Correct means |
|---|---|---|
| M1 | Onboarding | Illustration, title, subtitle, lime Get Started. |
| M2 | Get Started → Social | Feed of real posts/trades. |
| M3 | Tab bar | 5 slots, no labels, lime pill on active, dark centre Post. |
| M4 | Trade tab | Real coins, market caps, curve progress, working sorts. |
| M5 | Coin screen | Price, candles with OHLC readout + live-price badge, stats, NAV, activity. |
| M6 | Candle bucketing | Trades minutes apart do not collapse into one candle. |
| M7 | Post screen | Post, live coin card, replies, pinned composer. |
| M8 | Reply from the app | Posts, persists, count increments. |
| M9 | Profile | Identity, three-up stats, portfolio value, time ranges, chart, holdings. |
| M10 | Empty wallet | `$0` and "No history yet" — honest, not an error. |
| M11 | Launch screen | Form + 4 presets, each drawing its own curve. |
| M12 | No SVG-data-URI images | No "URI parsing error" redbox anywhere. |
| M13 | RPC-busy state | Clear "rate-limiting" message with a Try again button, not a generic failure. |

## 5. Unit / integration suites

| # | Item | Correct means |
|---|---|---|
| T1 | `npm run test:unit` | All pass. |
| T2 | `tests/integration/juno-tx.test.ts` | Signs server-built bytes and lands a real devnet buy. |
| T3 | `tests/integration/juno-pyth.test.ts` | Every shipped feed id resolves on-chain. |
| T4 | `tests/integration/juno-swaps.test.ts` | Decoder agrees with real history; tolerant of partial reads. |
| T5 | `npx tsc --noEmit` (both apps) | Clean. |
| T6 | `npm run build` | Production build green. |

## 6. Anti-mock audit

| # | Item | Correct means |
|---|---|---|
| X1 | No mock/stub/fake/placeholder in Juno surfaces | Grep returns only legitimate `placeholder=` input props. |
| X2 | No fabricated zeros | Unknown values render as `—`, never as `0` or `0.00%`. |
| X3 | No hardcoded trade sides | Every side comes from a vault delta. |
| X4 | Real DB | Postgres, persisted across restarts. |

---

## Results

Filled in during Phase 2. Nothing is marked PASS without the stated observable.
