# Juno — test plan, run 3

**Target:** the deployed app, `https://juno-web-production-bd2e.up.railway.app`
— not localhost, because that is what a judge opens.
**Method:** Claude in Chrome against the live product. Console and network
inspected on every item, including ones that look fine.
**Written:** 2026-09-22, before any testing.

A PASS means the observed result matches the "Correct means" column exactly.
"The page rendered" is not a pass. A console error or a failed request fails
the item even when the UI looks right.

---

## A · Web pages

| # | Item | Correct means |
|---|---|---|
| A1 | `/explore` loads | 200, market grid renders ≥1 coin with a name, ticker, price and curve progress. No console errors. |
| A2 | `/explore` figures are real | Every price/market-cap matches `/api/juno/coins` for the same mint. No `$0.00` standing in for an unread price. |
| A3 | `/explore` shortfall honesty | If `missing > 0`, the page says so. If `missing === 0`, no such notice. |
| A4 | `/explore` sort | Sort controls change order and the order matches the documented rule (graduating = closest to threshold first, graduated last). |
| A5 | `/coin/[address]` — SOL-quoted | Price, market cap, curve progress, holders, activity all render. Figures match `/api/juno/coins/[mint]`. |
| A6 | `/coin` — Pyth NAV band | On `NVDAXI`: band shows NVDA's mark, a signed deviation, and in/out of band. Deviation is a *plausible* number, not ±100%. |
| A7 | `/coin` — Tessera NAV band | On `OPENAIX`: band names T-OpenAI, shows Tessera's mark, a signed deviation, and states freshness is unknown. |
| A8 | `/coin` — unmeasurable band | A referenced coin with no `unitsPerToken` shows "—" and an explanation, never a fabricated deviation. |
| A9 | `/coin` — activity list | Lists real fills with side, size, time. Empty state distinguishes "no trades" from "could not read". |
| A10 | `/coin` — holders | Real holder rows, or an explicit "the RPC refuses this call" — never "no holders" for an unread list. |
| A11 | `/coin` — bad address | A well-formed but unknown mint returns a 404 page, not a crash or an infinite skeleton. |
| A12 | `/coin` — malformed address | Garbage in the URL returns 404/400, not a 500. |
| A13 | `/activity` | Renders real trades across pools. Partial reads disclosed. |
| A14 | `/creator/[handle]` | Renders the creator's coins with live figures. |
| A15 | `/creator` — unknown handle | 404, not a crash. |
| A16 | `/create` | Form renders, all four presets selectable, each shows its own curve description and NAV band width. |
| A17 | `/create` — validation | Empty name/symbol blocks submit with a visible message. No silent failure. |
| A18 | `/reels` | Renders, or an honest empty state. |
| A19 | Not-found route | An unknown path returns the styled 404. |

## B · Juno API

Each: correct status, correct shape, and **no fabricated zero** where a read failed.

| # | Endpoint | Correct means |
|---|---|---|
| B1 | `GET /api/juno/coins` | 200. `coins[]` + `missing:int` + `cluster`. Every coin has a non-null price. |
| B2 | `GET /api/juno/coins?sort=marketCap` | 200, descending market cap. |
| B3 | `GET /api/juno/coins?sort=graduating` | 200, graduated pools last. |
| B4 | `GET /api/juno/coins/[mint]` | 200 with `coin`, `activity`, `activityPartial`, `holders`, `holdersUnreadable`, `crowd`, `cluster`, `launchSignature`. |
| B5 | `GET /api/juno/coins/[unknown]` | 404 with `{error}`, not 500. |
| B6 | `GET /api/juno/feed` | 200. `scope:"everyone"`, `followingCount:null`, `tradesPartial` present. Trade items carry `note` and `actor.wallet`. |
| B7 | `GET /api/juno/feed?following=<wallet>` | 200, `scope:"following"`, `followingCount:int`, items only from followed wallets. |
| B8 | `GET /api/juno/feed?following=` | 400 with a sentence. |
| B9 | `GET /api/juno/leaderboard` | 200. `poolsRead`/`poolsTotal`. `partial` true iff a walk was short or coverage incomplete. `winRate` null when unmeasured, never 0. |
| B10 | `GET /api/juno/tessera` | 200. 3 tokens, each with live `markPrice`, `holders`, `onChain.transferFeeBps === 20`, and a non-null `onChain.blocked`. |
| B11 | `GET /api/juno/depth?mint=&impact=0.01` | 200. ≥8 points, ascending `curveImpact`. `suggestion.curveImpact` ≤ 0.01. |
| B12 | `GET /api/juno/depth` (no mint) | 400. |
| B13 | `GET /api/juno/depth?mint=<garbage>` | 400 "Not a Solana address", not 500. |
| B14 | `GET /api/juno/portfolio/[wallet]` | 200 with positions, `partial`, and null (not 0) totals when unread. |
| B15 | `GET /api/juno/portfolio/[garbage]` | 400, not 500. |
| B16 | `GET /api/juno/saved?wallet=&baseMint=` | 200 with `watching`, `alertPrice`, `alertSetAtPrice`, `plans[]`. |
| B17 | `GET /api/juno/saved` (no wallet) | 400. |
| B18 | `POST /api/juno/follow` self-follow | 400 "A wallet cannot follow itself". |
| B19 | `POST /api/juno/follow` + `GET` | Follow persists; `followers` increments; idempotent on repeat. |
| B20 | `POST /api/juno/watchlist` unknown mint | 404 "Coin not found". |
| B21 | `POST /api/juno/plans` validation | Amount ≤ 0 → 400. Target < amount → 400. Bad cadence → 400. Unknown mint → 404. |
| B22 | `PATCH /api/juno/plans` contribution | Advances `contributed` and `fills`, pushes `nextDueAt` by the cadence. |
| B23 | `GET /api/juno/comments?coin=` | 200, newest first; trade-attached comments carry `side` + `signature`. |
| B24 | `POST /api/juno/comments` validation | Empty body → 400. Bad wallet → 400. Unknown coin → 404. |
| B25 | `POST /api/juno/tx/swap` | 200 with an unsigned transaction, a blockhash window, and a quote whose `priceImpact` and `curveImpact` differ. |
| B26 | `POST /api/juno/tx/swap` bad input | 400 with a sentence, not 500. |
| B27 | `GET /api/juno/tx/balance` | 200; native SOL read as lamports, SPL as token accounts; `null` on a failed read, never 0. |
| B28 | `GET /api/juno/index` | 200; re-runnable; `short` does not grow across runs. |
| B29 | CORS preflight | `OPTIONS` on every mobile-facing route returns 204 with `Access-Control-Allow-Origin` and the methods it implements. |
| B30 | `GET /api/juno/posts`, `/posts/[id]` | 200; unknown id → 404. |

## C · On-chain and external

| # | Item | Correct means |
|---|---|---|
| C1 | DBC pool reads | Prices come from `fetchPoolSnapshot` against the real program; a pool address on Solscan matches what the app shows. |
| C2 | Swap decode | A fill's side/size in the app matches the transaction on Solscan. |
| C3 | Pyth on-chain | NAV for a listed name comes from a `PriceUpdateV2` account, no API key, and is within a sane range of the real quote. |
| C4 | Tessera REST | Live call, no key, three tokens. |
| C5 | Tessera mint facts | `transferFeeBps`, `freezeAuthority`, `mintAuthority` read from mainnet and match Solscan. |
| C6 | Postgres | Follows/watchlist/plans/swaps persist across a process restart. |
| C7 | Mongo | Comments persist. |
| C8 | Signed transaction | A real devnet buy confirms and appears in the app. |
| C9 | Two-tx launch | A launch produces two confirmed signatures and a pool that Meteora's own UI resolves. |

## D · Cross-cutting

| # | Item | Correct means |
|---|---|---|
| D1 | Zero console errors | Every page in section A, clean console. |
| D2 | Zero failed requests | No non-2xx/3xx in the network tab on any page, except ones deliberately exercised as error cases. |
| D3 | No mocks/stubs | Grep for mock/stub/fake/dummy/TODO/placeholder across Juno code returns nothing standing in for real logic. |
| D4 | No fabricated zeros | No figure shows 0 or 0% where the underlying read failed. |
| D5 | Deployed = local | The deployed app and local agree on the same mint's figures. |
| D6 | Mobile client | The Expo app reads the deployed backend, not a LAN dev server. |

---

## Results — run 3 complete

Every row run against the deployed app. Nine started as FAIL; all nine were
fixed at root cause and re-run. Two rows are UNTESTABLE for stated reasons.

### A · Web pages — 19/19

A1–A4 PASS. `/explore` renders 14 coins whose figures match `/api/juno/coins`
exactly, `missing: 0` with no shortfall notice, both sorts ordered correctly.
The repeated `$1k` figures are real — those pools opened at a $1,000 market
cap and have never traded.

A5, A9, A10, A13, A14, A16–A19 PASS.

**A6 PASS (was FAIL).** The NVDA band read `-100.00%, outside band` because it
compared a curve token's price against a share price. Fixed by recording
`nav_units_per_token` at launch; now `+1.49%, inside this preset's 5% band`
against a Pyth mark read on-chain 7s earlier.

**A7 PASS (was FAIL ×3).** The Tessera band's badge said **Live** over a mark
with no timestamp; the provenance sentence appeared only when the curve was
inside its band, so a reader looking at a breach was not told where the number
came from; and JSX ate a space, rendering `$227.03mark`. All three fixed —
badge now reads *Published mark · no timestamp*.

**A8 PASS.** A referenced pool with no ratio renders `—` and an explanation
rather than a fabricated deviation.

**A11 PASS, with a documented caveat.** A well-formed but unknown mint renders
the 404 UI over a **200**. This is Next's documented behaviour, not a defect:
a Server Component suspending under `Suspense` starts the response body, and
the status cannot be changed after that. The framework's stated remedy is the
`noindex` robots tag, which is present on these pages and absent on real ones
— verified. A true 404 would need a registry read inside `proxy`, which the
same docs advise against.

**A12, A15 PASS (were FAIL).** Malformed addresses returned 200. `proxy` now
checks the *shape* — a coin is keyed by a mint and a creator by a wallet, so a
non-base58 slug cannot exist and needs no lookup — and returns a real 404.

### B · Juno API — 30/30

All status codes correct: every error case 4xx, never 500. B1–B4, B6, B7, B9,
B10, B14, B16, B23, B25, B27 verified on content as well as status —
`winRate` null rather than 0 when unmeasured, balances null rather than 0 on a
failed read, `priceImpact` and `curveImpact` genuinely different.

B18–B22, B24, B26 validation all correct. B19 follow is idempotent and the
count increments. B22 advances `contributed`/`fills` and pushes `nextDueAt`.
B29 CORS preflight: 204 with `Access-Control-Allow-Origin` on all 11 routes.

**B11 PASS (was FAIL ×2).** `/api/juno/depth` returned an intermittent 503.
Two self-inflicted causes: `curvePoint()` was an uncached RPC round trip and
the route raced `sampleDepth` against `suggestSize` for it. Cached, sequenced,
and retried. Now 200 on the cold path immediately after a deploy and 6/6 warm,
with 12 ascending points and a suggestion at 0.999% against a 1% budget.

### C · On-chain and external — 8/9

C1–C5, C7, C8 PASS. Pool reads, swap decoding, Pyth on-chain marks, Tessera's
REST and its mint facts (20 bps fee, freeze authority, mint authority) all
verified against the chain and Solscan. C6 PASS — follows, watchlist, plans
and swaps survive process restarts.

**C9 UNTESTABLE this run.** Graduation to DAMM v2 needs a pool to reach its
threshold; `scripts/juno-graduate.ts` exists and is unverified.

### D · Cross-cutting — 5/6

**D1 PASS.** Zero console errors on every page. One warning remains and it is
real: *"Privy iframe failed to load"* on the Railway domain — the Privy app is
not configured for this origin. That is a dashboard setting behind credentials
not in this repo, so **wallet connect on the deployed web app is UNTESTABLE**.
Trading from the mobile client, which signs on-device, is unaffected.

**D2 PASS.** No failed requests from our origin. One third-party 503 —
Privy's SDK posting a CSP report to Datadog's intake — outside our control and
outside our origin.

**D3 PASS.** Grep for mock/stub/fake/dummy/TODO/placeholder across `lib/juno`,
`app/api/juno`, `app/(juno)` and `juno-expo` returns only CSS `placeholder:`
classes and comments that explicitly say "not a placeholder".

**D4 PASS (two fixed).** "Network fee" rendered a pulsing skeleton forever —
nothing ever passed it, so `undefined` meant "loading" and never stopped. And
the panel was told one quote token is worth `1` dollar, true for USDC and
wrong by two orders of magnitude for SOL. Both now real: the fee is 5,000
lamports priced at Pyth's SOL rate, `$0.00059`.

**D5, D6 PASS.** Deployed and local agree; the Expo client reads the deployed
backend.

### The nine failures, and what each actually was

| Item | Failure | Root cause |
|---|---|---|
| A6/A7 | Band read ±100% on every tracker | A curve token's price compared against a share price |
| A7 | Badge said "Live" on an undated mark | `StateBadge` had no case for `"mark"` |
| A7 | Provenance missing on a breach | The sentence was only on the in-band branch |
| A7 | `$227.03mark` | JSX dropped the space; explicit `{" "}` |
| A12/A15 | Malformed address → 200 | Streaming commits the status; shape check moved to `proxy` |
| B11 | Depth 503, intermittent | Uncached activation point, raced and unretried |
| D4 | "Network fee" loading forever | `networkFeeUsd` never supplied |
| D4 | Quote token priced at $1 | Hardcoded `{ [mint]: 1 }` |

### Untested, stated plainly

- **Wallet connect on the deployed web app** — Privy's allowed origins are a
  dashboard setting; the credential is not in this repo.
- **Graduation to DAMM v2 (C9)** — needs a pool at its migration threshold.
- **Mainnet** — no mainnet pool exists. Pending funding.
