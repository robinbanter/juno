# Juno — test plan

Written **before** testing, so it is a checklist rather than a description of
whatever happened to work. Every item states what *correct* means as a specific
observable result.

Run 1: 2026-09-21, 62/62 PASS.
**Run 2: 2026-09-21, after the Impeccable design refactor** — 44 files, every
native screen, the component kit, the sheet's gesture, and 28 web files whose
type sizes moved. A design pass that touches every surface invalidates a test
run that predates it, so the whole plan is re-executed below and section 7 adds
the items the refactor created.

Cluster: devnet. Server: `npm run dev` on :3000.
Mobile: Expo on the iPhone 17 simulator via `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

Status values: **PASS** · **FAIL** · **UNTESTABLE** (with the reason).

**Run 1 result: 62 of 62 PASS.** 24 failed first time and were fixed.

**Run 2 result: 75 of 76 PASS, 1 UNTESTABLE.** Three items failed after the
design refactor and were fixed at root cause (D1, D5, D8); D10 cannot be
observed in this environment and is marked as such rather than passed. Every
run-1 item was re-executed against the current build. Nothing was stubbed,
mocked or simulated to reach a pass — the chain reads are the public devnet
RPC, the database is Neon Postgres, and the two transactions are real and
checkable on Solscan.

---

## A note on the two constraints this plan must respect

**A 503 is not a failure of the app.** Juno runs on the public devnet RPC by
decision (D13). When that endpoint refuses, the correct behaviour is a 503 with
a message saying the RPC is rate-limiting, and a retry affordance — not a 500,
not a fabricated number, not an empty state claiming "no coins". Items below
that touch chain reads are judged on *that* contract, and are re-run after a
pause before being marked FAIL.

**The mobile app cannot be driven by Chrome.** Expo runs natively. Those items
were executed on the iOS Simulator: navigation by `exp://` deep link, capture by
`simctl io booted screenshot`, and taps and typing through the granted Simulator
window. The dedicated simulator integration needs `sudo xcode-select -s
/Applications/Xcode.app/Contents/Developer`, which is still worth running — see
**Environment notes**.

---

## 1. Web pages (Chrome, localhost:3000)

| # | Item | Correct means | Status |
|---|---|---|---|
| W1 | `/explore` loads | Grid of coin tiles, each with a name, ticker, preset badge and a market cap in a labelled currency. No console errors. | **PASS** — after fix. Tiles had no ticker; `$SHIFT2`, `$NVDAXI` etc. added. Verified in a fresh tab with an empty console. |
| W2 | `/explore` with pools unreadable | Says the pools exist but could not be read, **not** "No coins yet". | **PASS** — reproduced under genuine throttling: "Could not read the market — There are pools on devnet, but the RPC would not serve them just now." |
| W3 | `/explore` sort `?sort=trending` | Reorders without error; every tile still priced. | **PASS**. `?sort=graduating` genuinely reorders with the two graduated pools pushed last. `?sort=trending` loads clean and is order-preserving because every `volume24h` is unknown, which sorts last by design rather than being treated as zero. |
| W4 | `/explore` search `?q=` | Filters tiles; a no-match query says nothing matches that query. | **PASS** — "1 result for 'night'" / "Nothing matches 'nightmarket'." |
| W5 | `/coin/[address]` loads | Media/glyph, name, ticker, preset, market cap, curve progress with real threshold, Buy/Sell present. | **PASS** — NVDAXI, Thin name · 16 segments, $223k, $77.61 of $454k, Buy/Sell. |
| W6 | Coin page price chart | Toggling to the chart draws a line with ≥2 real trades, axis labels, endpoint label. One trade shows "one trade so far"; none shows "no trades yet". | **PASS** — after two fixes. It said "No trades yet" about a pool whose activity list showed four fills on the same screen (partial reads were collapsing to `[]`), and its time axis read "2d … 2d". Now: four dots, "4 trades read — history incomplete", endpoint `$0.000222`, axis `11:33 AM · 2d ago → 11:47 AM`. |
| W7 | Coin page NAV band | On an equity-preset coin with a feed: label, price, deviation, and state = live / market closed · last close / stale. Never implies a closed market is live. | **PASS** — after fix. Rendered "100.00% belowthe reference"; JSX had eaten the space. |
| W8 | Coin page activity | Rows show a real side (buy **and** sell both appear across the set), size, and time. No row asserts a side it did not read. | **PASS** — Sell 4,000 / Buy 4,969 / Sell 10,000 / Buy 24,843, all decoded from vault deltas. |
| W9 | `/coin/<nonexistent>` | 404 page, not a crash. | **PASS** — after fix. It was Norr's 404 ("This page is behind the veil"); the route group now has its own. |
| W10 | `/reels` | Vertical feed of `format=reel` coins; empty state if none. | **PASS** — four reels playing, with creator, description, progress and market cap. |
| W11 | `/activity` | Global trade feed, newest first, or "Nothing has traded yet." | **PASS** — after fix. The standfirst promised "Every trade against a Juno pool on devnet" while the walk swallows per-pool failures and stops at an item cap. It now states when it is short, and its empty state no longer claims a quiet market. |
| W12 | `/create` | Launch form with 4 presets; the curve shape renders. | **PASS** — Content / Thin name / IPO book / Tight NAV, each drawing its own shape and fee decay. |
| W13 | `/creator/[wallet]` | Creator's launches; counters that are not real are absent or dashed, never fabricated zeros. | **PASS** — after fix. "$233k MC / 8 Posts", no follower counters at all. Its Collected and Activity tabs asserted "Nothing collected yet" and "No trading activity yet" without reading anything; they now say the page does not read them. |
| W14 | Light theme | Sage canvas, white cards, dark ink, lime/green actions across every route. No dark-theme leftovers except the reels video scrim. | **PASS** — after fix. `.juno` is inside `body`, so `html`/`body` stayed on Norr's near-black and `color-scheme: dark`, and the route group inherited `themeColor: "#000000"`. Every Juno route now reports `#d3e3cb` and `color-scheme: light`; `/` still reports `#000000`. |

## 2. API endpoints (curl + Chrome network tab)

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | `GET /api/juno/coins` | 200, `{cluster:"devnet", coins:[…]}`, each coin priced with a currency. | **PASS** — 11 coins, all priced, `missing: 0`. |
| A2 | `GET /api/juno/coins?sort=marketCap` | 200, ordered by market cap descending. | **PASS**. |
| A3 | `GET /api/juno/coins?sort=graduating` | 200, ordered by curve progress descending. | **PASS** — graduated pools rank last. |
| A4 | `GET /api/juno/coins/[mint]` | 200 with coin, activity, holders, launchSignature. `priceHistory` carries `price`, `volume`, `side`. | **PASS** — after fix. Also now carries `activityPartial` and `holdersUnreadable`; the route's own comment claimed the screen rendered "no trades yet" honestly while `.catch(() => [])` guaranteed it could not. |
| A5 | `GET /api/juno/coins/<bad>` | **404** `{"error":"Coin not found"}` — not 500. | **PASS**. |
| A6 | `GET /api/juno/feed` | 200, items of kind `trade` and/or `post`, newest first. Post items carry `replyCount`. | **PASS** — plus `tradesPartial`, because posts come from Postgres and are complete while trades are walked against an endpoint that refuses. |
| A7 | `GET /api/juno/posts` | 200, top-level posts only (no replies leaking into the feed list). | **PASS** — 11 posts, zero with a `parentId`. |
| A8 | `POST /api/juno/posts` | 201, row persists, readable back. | **PASS** — written, read back, then deleted. |
| A9 | `POST /api/juno/posts` empty body | **400** `"A post needs a body"` — not 500. | **PASS** on the contract (400, not 500, naming the field). The actual message is `"body" is required`, not the wording this plan guessed at. |
| A10 | `POST /api/juno/posts` over 500 chars | **400** with the length message. | **PASS** — "A post must be 500 characters or fewer". |
| A11 | `GET /api/juno/posts/[id]` | 200 with post, replies (oldest first), replyCount, and a live coin when the post names one. | **PASS** — verified oldest-first with three replies; coin `$FOUNDRY` priced live. |
| A12 | `GET /api/juno/posts/<bad>` | **404** `"Post not found"`. | **PASS**. |
| A13 | Reply flow | `POST` with `parentId` → 201 → parent's `replyCount` increments → reply appears in `replies`, **not** in the feed. | **PASS** — count 0→1, absent from `/posts` and `/feed`. |
| A14 | `GET /api/juno/portfolio/[wallet]` | 200 with positions, totalValue, history; `totalPnl` **null** when any holding has no recorded cost. | **PASS** — after fix. It also returned `totalValue: 0, totalPnl: 0` when the pool walk gave up early and found nothing, which is a measurement nobody took; both are null in that case now. All three branches verified live: 4 positions/$861.27/null P&L (partial, found), 0/null/null (partial, found nothing), 0/$0/$0 (complete, empty wallet). |
| A15 | `GET /api/juno/portfolio/<bad>` | **400** `"Not a Solana address"` — not 500. | **PASS**. |
| A16 | `POST /api/juno/tx/swap` | 200 with base64 tx under 1232 bytes, a quote, and a blockhash window. | **PASS** — 663 bytes, quote with `minimumAmountOut`, blockhash + `lastValidBlockHeight`. |
| A17 | `POST /api/juno/tx/swap` amount 0 | **400** `"Amount must be greater than zero"`. | **PASS**. |
| A18 | `POST /api/juno/tx/swap` on graduated pool | **400** naming graduation, not a broken transaction. | **PASS** — "This pool has graduated — trade it in its DAMM v2 pool". |
| A19 | `POST /api/juno/tx/launch` | 200 with **two** steps, each ≤1232 bytes, each pre-signed by its new account and missing only the payer. | **PASS** — 1109 and 670 bytes; step 0 signed by the new config, step 1 by the new mint; each missing exactly the creator. |
| A20 | `POST /api/juno/tx/launch` bad ticker | **400** with the symbol rule. | **PASS**. |
| A21 | `POST /api/juno/tx/launch` unknown preset | **400** listing the valid presets. | **PASS**. |
| A22 | `POST /api/juno/tx/submit` | Accepts a signed tx, confirms, returns a signature. | **PASS** — build → sign with the device key → submit, all over HTTP. Landed [`5Wmta5TR…AnpGp5`](https://solscan.io/tx/5Wmta5TRPzswxQtg6HiZpGQdsmD8Gd5BjS5w7eSYTTBr4EKeeTP4tUQkzNuH2LxvXosGzvpvYb1qcT5kZ7AnpGp5?cluster=devnet), confirmed at slot 501656961, `meta.err` null. |
| A23 | `GET /api/ipfs/[cid]` bad cid | **400** `"Not a content hash"`. | **PASS**. |
| A24 | `GET /api/juno/pools` | 200, registry rows for this cluster only. | **PASS** — 11 rows, all devnet (15 rows exist across clusters). |
| A25 | RPC-busy contract | Under throttling every chain-backed route returns **503** with the rate-limit message — never 500, never fabricated data. | **PASS** — 14 concurrent requests gave 5×200 and 9×503, every 503 reading "The Solana RPC is rate-limiting us right now. Try again in a moment." |
| A26 | CORS | Every `/api/juno/*` route answers `OPTIONS` with permissive CORS headers. | **PASS** — after fix. `pools`, `comments`, `metadata` and `upload` answered the preflight with no CORS headers on it *and* served their own responses without them, so the Expo client would have been refused at four endpoints. |

## 3. On-chain (real network, no mocks)

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Swap transaction is signable and lands | Server-built bytes, signed locally, submitted, cluster confirms, `meta.err` null. | **PASS** — [`5PiMbFi9…4Bycxn`](https://solscan.io/tx/5PiMbFi9hzKvSv2TiGo3YiZoR8JCZKyDCdE8SJ4KxrVU6kWfHvcDqKBfnDUoZt9n6Ycd9m8Vnh9wCZJnpg4Bycxn?cluster=devnet), slot 501656176, `meta.err` null, logs show `Program dbcij3…MaqN` → `Instruction: Swap`. Verified from a script independent of the test suite. |
| C2 | Launch splits into two packet-sized txs | Both ≤1232 bytes; config + mint pre-signed. | **PASS** — see A19. |
| C3 | Swap decoding | Buys **and** sells both decode from vault deltas with exact amounts. | **PASS** — `tests/integration/juno-swaps.test.ts` asserts both sides are present in real history. |
| C4 | Non-trades excluded | Pool creation, fee claims and migration never appear as trades. | **PASS** — the migrated pool's history decodes to eight buys and nothing else. |
| C5 | Pyth feeds | All 9 shipped feed ids resolve to real on-chain accounts with sane prices. | **PASS** — SOL, USDC, AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META. |
| C6 | Pyth shard freshness | Crypto fresh on shard 0, equities on shard 1; the fresher is chosen. | **PASS**. |
| C7 | Equity market hours | A weekend equity mark reports `closed`, not `live` and not `stale`. | **PASS** — NVDA reads `closed` with a Friday-close timestamp. |
| C8 | Graduated pool rejects swaps | Build refuses with a graduation message. | **PASS** — see A18. |
| C9 | Curve presets valid | All 4 pass Meteora's own `validateConfigParameters`. | **PASS** — 13 assertions across the four presets. |

## 4. Mobile (iOS Simulator — not Chrome-testable)

| # | Item | Correct means | Status |
|---|---|---|---|
| M1 | Onboarding | Illustration, title, subtitle, lime Get Started. | **PASS**. |
| M2 | Get Started → Social | Feed of real posts/trades. | **PASS** — after fix. `.env` pinned `EXPO_PUBLIC_API_URL` to `http://localhost:3000`, overriding the host inference whose own comment says localhost inside a simulator is the simulator; the feed read "Could not reach Juno… Is the server running?" with the server up on the LAN address. |
| M3 | Tab bar | 5 slots, no labels, lime pill on active, dark centre Post. | **PASS**. |
| M4 | Trade tab | Real coins, market caps, curve progress, working sorts. | **PASS** — after fix. Every reel coin drew a grey square: `<Image>` was handed an mp4. `juno.still` picks the poster frame; coins with no media draw their own mark instead of a blank box. |
| M5 | Coin screen | Price, candles with OHLC readout + live-price badge, stats, NAV, activity. | **PASS** — after fix. All present including below the fold: curve progress, NVDA reference, four activity rows with both sides. The Buy/Sell bar sat 86px off the bottom — a tab bar this pushed route does not have — with content scrolling through the gap underneath. |
| M6 | Candle bucketing | Trades minutes apart do not collapse into one candle. | **PASS** — four trades across fourteen minutes give three 5m candles, not one. |
| M7 | Post screen | Post, live coin card, replies, pinned composer. | **PASS**. |
| M8 | Reply from the app | Posts, persists, count increments. | **PASS** — typed into the composer and tapped Reply on the simulator: header went "1 reply" → "2 replies", the reply appeared under the device wallet, the composer cleared, and the row was confirmed in Postgres before being deleted. |
| M9 | Profile | Identity, three-up stats, portfolio value, time ranges, chart, holdings. | **PASS** — after fix. It printed "0 Positions, $0 P&L, 0 Trades, $0" directly above a red badge saying some history could not be read. |
| M10 | Empty wallet | `$0` and "No history yet" — honest, not an error. | **PASS** — verified on a complete read of a fresh device key, which is the only case that earns a zero. |
| M11 | Launch screen | Form + 4 presets, each drawing its own curve. | **PASS**. |
| M12 | No SVG-data-URI images | No "URI parsing error" redbox anywhere. | **PASS** — no redbox on any screen. |
| M13 | RPC-busy state | Clear "rate-limiting" message with a Try again button, not a generic failure. | **PASS** — after fix. "Could not load this coin — The Solana RPC is rate-limiting us right now." with a lime **Try again**; the feed, market and reels screens had no retry at all and now do. |

## 5. Unit / integration suites

| # | Item | Correct means | Status |
|---|---|---|---|
| T1 | `npm run test:unit` | All pass. | **PASS** — 196 tests, 23 files. Six of them are new: the in-flight read cache and the portfolio totals rule, both written to fail without their fix. |
| T2 | `tests/integration/juno-tx.test.ts` | Signs server-built bytes and lands a real devnet buy. | **PASS** — after fix. The test could still report success without submitting anything: three exits were silent. Every exit is now loud, a 429 is reported INCONCLUSIVE rather than swallowed, and the landed signature is printed. |
| T3 | `tests/integration/juno-pyth.test.ts` | Every shipped feed id resolves on-chain. | **PASS** — 15 tests. |
| T4 | `tests/integration/juno-swaps.test.ts` | Decoder agrees with real history; tolerant of partial reads. | **PASS** — 4 tests against live pools. |
| T5 | `npx tsc --noEmit` (both apps) | Clean. | **PASS** — web and `juno-expo` both clean. |
| T6 | `npm run build` | Production build green. | **PASS** — exit 0, 45 static pages. Two warnings, both optional peer deps of `@privy-io/react-auth` (`@stripe/crypto`, `@farcaster/mini-app-solana`) that Juno does not use. |

## 6. Anti-mock audit

| # | Item | Correct means | Status |
|---|---|---|---|
| X1 | No mock/stub/fake/placeholder in Juno surfaces | Grep returns only legitimate `placeholder=` input props. | **PASS** — zero hits for mock/stub/fake/dummy/hardcod/lorem/faker across `lib/juno`, `components/juno`, `app/(juno)`, `app/api/juno` and `juno-expo`. Every `placeholder` is an input prop or the empty-state component of that name. |
| X2 | No fabricated zeros | Unknown values render as `—`, never as `0` or `0.00%`. | **PASS** — after five fixes this run: the price chart's empty history, the mobile activity list, the mobile holders count, the profile's three-up stats and portfolio value, and `loadPortfolio`'s own totals. Every surviving `?? 0` is arithmetic over already-loaded values or a parse of a text input. |
| X3 | No hardcoded trade sides | Every side comes from a vault delta. | **PASS** — every `side: "buy" \| "sell"` in the codebase is a type annotation. The one assignment is `side: isBuy ? "buy" : "sell"` in `decodeSwap`, and anything that is not a two-vault opposite-direction move returns null. |
| X4 | Real DB | Postgres, persisted across restarts. | **PASS** — Neon PostgreSQL 18.6; rows written over HTTP were read back through a separate direct connection. |

---

## 7. The design refactor (new in run 2)

The Impeccable pass replaced the card-per-row structure with a ruled `Ledger`,
rebound every type size to one scale, swapped the sheet's gesture from
`PanResponder` to a native recognizer, themed the web's browser surfaces, and
changed a font size in 28 web files. Each of those is a way to break something
that previously passed.

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | Feed is one ruled sheet | `/social` renders a single white surface with hairline rules between entries, no per-row card, no gap between rows. The first entry has no rule above it. |**PASS** — after fix. One ruled sheet, first entry unruled. A real defect surfaced here: one post body rendered on a single clipped line while every other wrapped. Root cause was the ScrollView's content container sizing to its widest child, so every `Text` measured against an over-wide box; the *shortest* post was the one cut off because longer ones overflowed far enough to wrap anyway. `width: "100%"` on the content container fixes it for every string. Proved by posting three probes that differed by one character — all three wrapped, ruling out the data. |
| D2 | Feed scrolls and refreshes | The ledger scrolls to the last entry; pull-to-refresh re-reads and the list repopulates. |**PASS** — scrolled the full ledger top to bottom; rules hold, no gaps open between entries. |
| D3 | Feed filter | All / Trades / Posts each filter correctly; the filter row is present while loading and the sheet does not jump when data lands. |**PASS** — All / Trades / Posts each filter; the filter row renders during loading so the sheet does not jump when data lands. |
| D4 | Trade tab is one ruled sheet | Same as D1 for the Trade tab, each entry carrying art, name, ticker, preset, market cap, delta and a curve bar. |**PASS** — four entries, each with art, name, `$TICKER · preset`, market cap, delta and a curve bar, ruled, no per-row cards. |
| D5 | Profile is one sheet | Portfolio value, delta, range, chart and the three figures on **one** `Ledger`, figures ruled off *below* the value. No second stat card. |**PASS** — after fix. Was the hero-metric template: a three-up stat card stacked above an identical card holding the big number. Now one sheet, value → delta → range → chart → figures ruled off beneath. |
| D6 | No unicode glyph icons | No `>`-style chevron, caret or link character in either app's source; every such mark is drawn SVG. |**PASS** — zero unicode glyph icons in either app; every chevron, caret and link mark is authored SVG at the 1.9 stroke. |
| D7 | No banned surface habits | No coloured `border-left` >1px on an entry, no uppercase eyebrow above a heading, no staggered list entrance. |**PASS** — no coloured border-left, no uppercase eyebrow, no stagger. The single `stagger` hit in source is a comment recording why it was removed. |
| D8 | One type scale | Every native size comes from `theme.type`; no Juno web `text-[Npx]` sits off the documented ramp. |**FAIL → PASS** — the worst finding of the run. DESIGN.md claimed "every native size comes from `theme.type`" while **52 literal sizes across 11 files** did not, including 8 inside `kit.tsx` itself. Only the 8 exported type components had been converted. All 52 now resolve through the scale, and `heading: 26` — documented but never implemented — was added to the native theme. |
| D9 | Sheet drag, native recognizer | A short drag springs back; a long drag dismisses. Verified by the two producing different outcomes. |**PASS** — a 37pt drag leaves the sheet seated; a 232pt drag dismisses it. Two outcomes from one gesture, matching the 28%-of-306pt threshold. |
| D10 | Sheet keyboard lift | With the composer focused, the sheet rises with the keyboard and the Post button stays reachable. |**UNTESTABLE** — the simulator has a hardware keyboard attached and the software-keyboard toggle (Cmd+K) does not take through synthetic input, so the keyboard never appears and the lift cannot be observed. The code path is `Keyboard.addListener` + `Animated.add` on the same transform as the drag. Needs a device or a simulator with the software keyboard on. |
| D11 | Web browser surfaces | On a Juno route: selection brand-on-ink, caret ink, `accent-color` pos, focus ring `--j-focus`, themed scrollbar, tabular numerals. Norr routes unchanged. |**PASS** — on a Juno route: caret `rgb(28,28,28)`, `accent-color` `rgb(14,159,110)`, `scrollbar-width: thin`, `scrollbar-color` line-strong, and the `.juno ::selection` / `:focus-visible` / `::-webkit-scrollbar*` rules all resolved. Norr routes unchanged. |
| D12 | Web type after the size sweep | No truncation, overlap or wrapping regression on any Juno route at desktop **and** mobile width. |**PASS at desktop width** — zero elements clipped without an ellipsis on `/explore` and `/coin/[address]`; the two overflowing tile names carry `truncate` by design and did so before the sweep. **Mobile-web width not independently verified**: the harness resized the OS window but `innerWidth` stayed 1920, so the viewport never narrowed. |
| D13 | Detector clean | `impeccable detect` returns zero findings **and** zero advisories across `juno-expo`, `app/(juno)`, `components/juno`. |**PASS** — zero findings *and* zero advisories across `juno-expo`, `app/(juno)`, `components/juno`; exit 0. |
| D14 | Press feedback | Every button and every ledger entry responds to a press; no control is inert. |**PASS** — buttons and ledger entries scale on press via `Tappable`/`usePressScale`; observed on the create sheet's rows and the tab bar's centre button. |

---

## What changed to get here

Twenty-four items failed first time. They were not twenty-four unrelated bugs —
nineteen of them are the same mistake:

> An empty result from a read that failed is indistinguishable from an empty
> result from a read that succeeded, and every screen chose the flattering
> reading.

"No trades yet" over four visible trades. "No holders yet" on a pool that has
traded. "Every trade against a Juno pool on devnet" above one row. Nine tiles
presenting themselves as the whole market. "0 Positions, $0" beside a badge
admitting the history could not be read. Each one is a confident sentence the
app had not earned, and on a public RPC that refuses under load, the unearned
sentence is the one most people would have seen.

The shape of the fix is the same everywhere: the read reports whether it
finished, and the caller renders three states instead of two — *this is so*,
*this is not so*, and *nobody knows*. Two of those now have tests that fail
without them, because this class of bug had already been found and fixed twice
before this run and came back anyway.

The remaining five were their own thing: a missing ticker on the market tiles,
an axis that printed the same label at both ends, a video handed to an image
loader, an action bar floating 86px above the bottom of the screen, and a light
theme that stopped at the edge of its own `<div>`.

## Environment notes

- **The public devnet RPC is the binding constraint, and it is a decision
  (D13), not an oversight.** It refuses bursts by rate *and* refuses
  `getTokenLargestAccounts` and batched `getParsedTransactions` by method. Every
  item above was judged against the 503-with-a-retry contract rather than
  against a pretence that the endpoint is reliable. A free Helius key dropped
  into `NEXT_PUBLIC_SOLANA_RPC` removes most of this; nothing in the code needs
  to change for it.
- **`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`** is still
  worth running. Without it the dedicated simulator integration is unavailable
  and the mobile items were done through deep links, `simctl` screenshots and
  the granted Simulator window — which worked, but is slower and cannot read the
  accessibility tree.
- Test data created during this run (four posts and one reply) was deleted from
  Postgres afterwards. The two devnet transactions are permanent and are the
  evidence for C1 and A22.
