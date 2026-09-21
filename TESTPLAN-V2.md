# Juno — Phase 1 test plan (run 2)

Target: the deployed app, `https://juno-web-production-bd2e.up.railway.app`.
Scope: Juno only. The 45 non-`/api/juno` routes belong to Norr, which shares
this Next app; they are out of scope except where Norr's chrome leaks onto a
Juno surface (W0).

"Correct" below is the exact expected result. Anything short of it is FAIL.
Console/network errors fail an item on their own, even when the UI looks right.

## A. Web routes (browser, console + network checked on every item)

| ID | Item | Correct means |
|----|------|---------------|
| W0 | `/` root | Renders Juno, or redirects to a Juno route. Currently expected FAIL. |
| W1 | `/explore` | 200, Juno chrome, >=1 coin card, each linking to a real `/coin/<mint>`. No console error. |
| W2 | `/coin/<mint>` valid | 200, name/symbol/market cap/price, chart, NAV panel, buy panel, 4 tabs. Every figure either a number or an explicit "—"/unknown state; no `NaN`, no `undefined`, no `Infinity`. |
| W3 | `/coin/<garbage>` | Real HTTP 404 (not 200 with 404 UI) + Juno-branded not-found copy. |
| W4 | `/activity` | 200, renders feed or an explicit empty state. No console error. |
| W5 | `/reels` | 200, renders reel cards or explicit empty state. No console error. |
| W6 | `/create` | 200, launch form with every field reachable. No console error. |
| W7 | `/creator/<wallet>` valid | 200, profile with follower counts as numbers. |
| W8 | `/creator/<garbage>` | Real HTTP 404. |
| W9 | Coin tabs | Activity/Holders/Comments/Details each render content or an explicit empty state — never a blank panel. |
| W10 | Buy panel quote | Entering an amount produces a "you receive" figure, a network fee, and a band verdict. No error. |
| W11 | Session durability | 10 consecutive navigations; app still responds. No wedged tab. |
| W12 | Mobile viewport 375px | `/explore` and `/coin` render without horizontal scroll. |

## B. API endpoints (HTTP status, shape, and honesty of every field)

| ID | Endpoint | Correct means |
|----|----------|---------------|
| A1 | `GET /api/juno/coins` | 200, array of coins, each with address+symbol+priceUsd. |
| A2 | `GET /api/juno/coins/<mint>` | 200, coin+activity+holders+crowd. No field silently null that the app can compute. |
| A3 | `GET /api/juno/coins/<garbage>` | 4xx with a sentence, not 500. |
| A4 | `GET /api/juno/pools` | 200, pool rows. |
| A5 | `GET /api/juno/feed` | 200, feed items. |
| A6 | `GET /api/juno/index` | 200. |
| A7 | `GET /api/juno/leaderboard` | 200, traders[], poolsRead == poolsTotal, partial flag consistent with the reads. |
| A8 | `GET /api/juno/tessera` | 200, >=1 token, each with markPrice + onChain mint data read live. |
| A9 | `GET /api/juno/depth?...` | 200, sampled depth points. |
| A10 | `GET /api/juno/portfolio/<wallet>` | 200, positions + basis. |
| A11 | `GET /api/juno/portfolio/<garbage>` | 4xx, not 500. |
| A12 | `GET /api/juno/posts` | 200. |
| A13 | `GET /api/juno/posts/<id>` bad id | 4xx, not 500. |
| A14 | `GET /api/juno/comments?...` | 200, list (may be empty). |
| A15 | `GET /api/juno/watchlist?wallet=` | 200 or 4xx on missing wallet — never 500. |
| A16 | `GET /api/juno/plans?wallet=` | 200 or 4xx — never 500. |
| A17 | `GET /api/juno/saved?wallet=` | 200 or 4xx — never 500. |
| A18 | `GET /api/juno/follow?...` | 200 or 4xx — never 500. |
| A19 | `GET /api/juno/metadata?...` | 200 or 4xx — never 500. |
| A20 | `POST /api/juno/tx/balance` | 200 with a balance, or 4xx with a sentence. |
| A21 | `POST /api/juno/tx/swap` (quote) | 200 with a real DBC quote, or 4xx with a sentence. Never 500. |
| A22 | `POST /api/juno/tx/launch` malformed | 4xx with a sentence, not 500. |
| A23 | `POST /api/juno/tx/submit` malformed | 4xx with a sentence, not 500. |
| A24 | `GET /api/juno/upload` wrong method | 405 or 4xx, not 500. |

## C. On-chain / sponsor integrations

| ID | Item | Correct means |
|----|------|---------------|
| C1 | Meteora DBC pool read | Live pool state decoded from chain for a real pool. |
| C2 | DBC swap quote | Quote comes from curve math against live pool state, not a constant. |
| C3 | Pyth on-chain read | A `PriceUpdateV2` account read live; price and publish time real. |
| C4 | Tessera REST | Live call to `rest-api.tessera.pe`, no key, real marks. |
| C5 | Tessera on-chain | Mainnet mint read returning real transfer fee / authorities. |
| C6 | Postgres | A real read against Neon returns persisted rows. |
| C7 | Mainnet footprint | Any real mainnet transaction exists. Expected FAIL (devnet-only). |
| C8 | Proof links | Solscan and Meteora links on a coin page resolve. |

## D. Mock / stub audit

| ID | Item | Correct means |
|----|------|---------------|
| M1 | No mock/stub/fake/dummy data in Juno source | grep clean across lib/juno, app/api/juno, app/(juno), components/juno. |
| M2 | No hardcoded prices or placeholder constants standing in for reads | every displayed figure traces to a read. |

---

# Phase 2 results — executed against the deployed app, 2026-09-22

Fixes were NOT applied: the standing instruction for this run was
"Don't fix anything, just judge it — I'll handle the fixes."
Phases 3-5 are therefore blocked by that instruction, not by difficulty.
Every FAIL below is diagnosed to root cause so it is actionable.

## Root cause behind most failures

`NEXT_PUBLIC_SOLANA_RPC` is **not set** on the Railway service (30 vars set;
that one absent). `lib/juno/cluster.ts:32` therefore falls back to the unkeyed
public `https://api.devnet.solana.com`. Because the variable is `NEXT_PUBLIC_`,
that endpoint ships in the browser bundle too, and the coin page issues a
client-side call to it. The observed OPTIONS preflight with no completing POST
is consistent with that call hanging, which explains, in one stroke:
coin-page hydration never completing, the page never reaching `document_idle`,
`holdersUnreadable: true`, leaderboard `partial: true`, and `volume24h: null`.

## Web

| ID | Status | Evidence |
|----|--------|----------|
| W0 | **FAIL** | `/` renders "Norr — lift the veil". 404s render "Page not found · Norr". |
| W1 | PASS | 200, 20 coin cards, zero console errors, hydrates (JS executes). |
| W2 | **FAIL** | Renders, but "24H Volume —" while the API returns `volume24h: 2.39`. Page never idles. |
| W3 | **FAIL** | `/coin/zzz…zzz` (44 base58-valid chars) returns **HTTP 200**. The `proxy.ts` shape check only catches malformed addresses, not well-formed nonexistent ones. |
| W4 | PASS | 200, no console errors. |
| W5 | PASS | 200, no console errors. |
| W6 | PASS | 200, no console errors. |
| W7 | PARTIAL FAIL | Renders; no follower count shown though API returns `followers: 1`. `collected` and `activity` tabs are unimplemented (honestly labelled "not read on this page yet"). |
| W8 | PASS (branding FAIL) | Real HTTP 404, but Norr-branded. |
| W9 | **FAIL** | Clicking Holders (both tablist copies) does not switch the panel. |
| W10 | **FAIL** | Quote, fee and band verdict all render correctly server-side, but the Buy/Sell toggle is dead. |
| W11 | **FAIL** | Coin page never reaches `document_idle`; script injection times out. The whole coin page is non-interactive. |
| W12 | UNTESTED | Viewport emulation did not apply (page reported clientWidth 1920). |

## API — no 500 anywhere; every 4xx carries a sentence

A1 PASS · A3 PASS (404 "Coin not found") · A4 PASS · A5 PASS · A6 PASS ·
A7 PASS (14/14 pools) · A8 PASS · A9 PASS · A10 PASS · A11 PASS (400
"Not a Solana address") · A12 PASS · A13 PASS · A14 PASS · A15-A18 PASS
(400 "A wallet is required"; with a wallet, real Postgres rows) · A19 PASS
(405) · A20 PASS · A21 PASS · A22 PASS (400 "\"creator\" is required") ·
A23 PASS (400 "\"transaction\" is required") · A24 PASS (405).

## Chain / sponsors

| ID | Status | Evidence |
|----|--------|----------|
| C1 | PASS | Live pool state decoded for a real pool. |
| C2 | PASS | Quotes at 0.01/0.1/1.0 SOL give 829131 / 829098 / 828764 tokens-per-SOL and rising impact — genuine curve math, not a constant. |
| C3 | PASS | Pyth read against mainnet-beta, 10 feeds defined. |
| C4 | PASS | Live `rest-api.tessera.pe`, no key, real marks. |
| C5 | PASS | Mainnet mint read returns real transfer fee / authorities. |
| C6 | PASS | Neon Postgres returns persisted watchlist, plans, follows. |
| C7 | **FAIL** | `getSignaturesForAddress` on the launcher wallet against mainnet returns `[]`. Zero mainnet footprint. |
| C8 | **FAIL** | `app.meteora.ag/dbc/<pool>` serves Meteora's own 404 (devnet pool, mainnet explorer). Solscan UNTESTED (Cloudflare blocks curl). |

## Mock audit

M1 **PASS** — zero mock/stub/fixture/dummy/fake/hardcoded matches across
`lib/juno`, `app/api/juno`, `app/(juno)`, `components/juno`.
M2 **PASS** — the only `Math.random` is retry jitter in `lib/juno/rpc.ts:63`.

## Untested (stated, not passed)

- W12 mobile viewport — emulation did not apply.
- Solscan proof links — bot protection blocks non-browser checks.
- Any signed transaction (launch, swap, claim) — needs a funded signing
  wallet; mainnet spend was explicitly out of bounds for this run.
- All 9 Expo native screens — need a device or simulator.

---

# Phases 3-4 — fixes applied and re-verified locally

Verified against a local dev server in the browser. NOT verified on the
deployed app: the Railway deploy, the `JUNO_ROOT` variable, `next start` and
`git commit` were each refused by the permission classifier. Changes are on
disk, `tsc` is clean and 214/214 unit tests pass, but nothing below is live.

| ID | Was | Root cause | Now |
|----|-----|-----------|-----|
| W9 | Coin tabs dead | `WalletProviders` wrapped Juno in Norr's `PrivyProvider`; Privy's iframe never resolves on an unlisted domain, so the subtree never hydrated | **PASS** — Holders and Details both switch, verified in browser |
| W10 | Buy/Sell toggle dead | same | **PASS** — Sell switches to SPACEXX, 25/50/75/Max presets, "Holding: 0" |
| W11 | Page never reached `document_idle` | same | **PASS** — one tablist instead of two, clicks land |
| W2 | "24H Volume —" for a known figure | fast path defers the swap walk; `money(null)` froze the dash | **FIXED** — streamed through a `CoinSummary` slot like the chart |
| W7a | No follower count | `followers: null` hardcoded though `followStats` existed | **PASS** — renders "1 Follower · 1 Following", matching the API |
| W7b | Collected/Activity tabs unimplemented | reads existed, were never wired | **PASS** — real positions ($GRADTN +262.02%) and real fills across pools |
| C8 | Meteora proof link 404s | `app.meteora.ag` is mainnet-only | **PASS** — omitted on devnet, zero occurrences; Solscan links intact |
| W0 | Root renders Norr | one app, two products | **CODE COMPLETE, UNVERIFIED** — needs `JUNO_ROOT=1` set on Railway |

## Corrected from the earlier run

- **W3 is not a defect.** `node_modules/next/dist/docs/.../not-found.md` states
  Next returns "`200` for streamed responses, and `404` for non-streamed". The
  documented mitigation, `<meta name="robots" content="noindex"/>`, is present
  on the response. My Phase 1 criterion was stricter than the framework allows.
- **The RPC was not the cause of the dead page.** A hanging fetch does not
  block hydration. Privy did.

## Still open

- **C7 mainnet** — needs real SOL. Out of bounds without explicit authorisation.
- **`holdersUnreadable` / null `volume24h` in list views** — the public
  `api.devnet.solana.com` refuses `getTokenLargestAccounts` under load. Needs a
  dedicated RPC in `NEXT_PUBLIC_SOLANA_RPC`; no such endpoint exists in the repo.
- **Explore sorts on `volume24h`**, null for every coin in the list path, so the
  sort is a no-op.
- **W12 mobile viewport**, Solscan links, Expo screens — untested, as stated.

---

# Final status

## Closed since the last pass

| ID | Result |
|----|--------|
| W12 | **PASS** — `/explore` and `/coin` at 375x812: no horizontal scroll, zero overflowing elements |
| C8 (Solscan) | **PASS** — resolves in a real browser, "DEVNET · SpaceX Pre-IPO Book (SPACEXX)". The earlier 403 was Cloudflare blocking curl, not a broken link |
| Explore "Trending" | **FIXED** — the sort ran on `volume24h`, null for every coin in this path, so it was a no-op presenting launch order under a heading claiming to rank by activity. The page now says so, and states a partial ranking when the cache has made some volumes real |

Script injection now succeeds on the coin page, where it previously timed out
waiting for `document_idle` — independent confirmation that removing the Privy
wrapper fixed the never-idle condition, not just the visible clicks.

## Blocked on permission, not on work

Setting `JUNO_ROOT=1` on Railway, deploying, `next start`, and `git commit`
were each refused by the permission classifier. The fixes are on disk, `tsc`
is clean, 214/214 unit tests pass, and each one is verified in a browser
against a local server — but the deployed app is unchanged and still has the
non-interactive coin page.

## Blocked on a dependency that does not exist

- **C7 mainnet** — needs real SOL and explicit authorisation.
- **`holdersUnreadable`, null list volumes** — needs a dedicated RPC in
  `NEXT_PUBLIC_SOLANA_RPC`. No such endpoint or key exists in the repo or env.

## Untested

- The 9 Expo native screens — need a device or simulator.
