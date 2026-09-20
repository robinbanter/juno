# Juno — build plan

Living document. Statuses are verified by running things, not by reading code.
Last verified: 2026-09-21.

Deadline: **Fri 25 Sep 2026, 16:00 ET** (STOCKLANA, Solana).

---

## 0. Decisions taken (2026-09-21)

| Decision | Choice |
|---|---|
| Deploy | Vercel for the app. It is one Next.js app — the API routes *are* the backend, so there is nothing to split. Railway revisited at deploy time only if the IPFS/RPC proxy is worth a long-running service. |
| Mainnet | **Not now.** Devnet + a **mainnet-fork** run to prove the mainnet code path. Real mainnet funded later by the user. |
| RPC | **Public endpoints**, with caching / bounded concurrency / backoff in code to survive a demo. No credential. |
| Git | Push branch `juno` to `origin`. |

---

## 1. Measured completion

**INITIAL: 70%** — measured 2026-09-21 by running typecheck, the unit suite, live
RPC probes and live DB reads. Not by reading file names.

Evidence gathered:
- `npx tsc --noEmit` → clean.
- `npm run test:unit` → 18 files, **140 passed**.
- `juno_pools` → **15 rows** (11 devnet, 4 mainnet-fork), read live from Neon.
- Devnet launcher `9CHr5g24…WYoE` holds **5.5092 SOL** — enough to execute real
  on-chain work without asking for funds.
- Meteora DBC lifecycle verified on-chain: launch → 8 buys → 100% curve →
  `migrateToDammV2` → DAMM v2 pool `EhvtVimk…MYy7L`, + a real fee claim.

### Two "BLOCKED" items in the previous plan were not blocked

Both were re-tested against live infrastructure and both are false.

**Pyth (was 5.3/5.4 BLOCKED, "Hermes needs an API key").** Hermes *is* behind a
key — confirmed, `/v2/updates/price/latest` returns **401**. But Pyth's prices
are also **on-chain on Solana**, in push-oracle `PriceUpdateV2` accounts owned by
`pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`, readable with nothing but an RPC
connection. Probed live, mainnet:

| Feed | Account | Read |
|---|---|---|
| SOL/USD (shard 0) | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` | $109.868353, 13s old |
| USDC/USD (shard 0) | `Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX` | $0.99995301, 7s old |
| AAPL/USD (shard 1) | `D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW` | $334.8159, Fri close |
| NVDA/USD (shard 1) | `5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd` | $222.515, Fri close |
| TSLA/USD (shard 1) | `FQB8c4zB8Emrp9W8bmyk6GanCLq4aRytHYPDAnaEpq9z` | $364.17481, Fri close |

Two facts that shape the implementation: **shard 0 is fresh for crypto, shard 1
for equities**, so the right account is per-feed and must be chosen by
comparing `publishTime`; and an equity feed at the weekend is *supposed* to be
hours old — that is the last close, not a broken read, so the UI must say
"market closed, last close" rather than either hiding it or implying it is live.
Reading Pyth **on-chain from Solana** is also a strictly better story for this
hackathon than an HTTP call would have been.

**Swap analytics (was "needs a swap-event indexer").** No indexer is needed.
`getParsedTransaction` returns `pre/postTokenBalances`; the pool's own base and
quote vault deltas give side, size, price and counterparty exactly. Verified
against devnet pool `FGcLWvDc…RBHpK`:

```
2E8UDB5v…  BUY   4,000 base for 0.00795413 SOL  → 1.9885e-6 SOL/token
5QzDFFKT…  SELL  4,968.59 base for 0.01 SOL
J8bCyCkc…  BUY   10,000 base for 0.01988536 SOL
```

That one decode unblocks **four** things at once: real Activity rows, 24h
volume, total volume, and the price chart.

### P0 defects found (things that are wrong, not merely missing)

| # | Defect | Evidence | Impact |
|---|---|---|---|
| D1 | Every Activity row is hardcoded `side: "buy"`, `amount: 0`, `valueUsd: 0` | `lib/juno/activity.ts:38-45` | **A trading screen asserting a direction it never read.** Sells render as buys. This is the one real dishonesty in the app. |
| D2 | `marketCapChangePct: 0` on every coin | `lib/juno/chain.ts:131` | Renders as a computed "0.00%" delta. Never derived. |
| D3 | Media kind sniffed from the URL extension | `lib/juno/chain.ts:99` | IPFS URLs carry no extension, so **every video renders as an image**. `media_mime` exists in the DB and is populated; nothing reads it. |
| D4 | `Equity.US.MSFT/USD` stored on a pool, absent from `PYTH_FEEDS` | `lib/juno/pyth.ts:17-21` vs DB row `FH3NaHes…` | NAV resolution returns null for a pool that claims a feed. |

---

## 2. Phases and status

Legend: `DONE` · `IN PROGRESS` · `NOT STARTED` · `BLOCKED`

### Phase A — Truth repairs (P0, no dependencies)
| # | Task | Status |
|---|---|---|
| A.1 | `lib/juno/swaps.ts` — decode side/size/price from vault deltas | NOT STARTED |
| A.2 | Real Activity rows (fixes D1) | NOT STARTED |
| A.3 | 24h volume + total volume from decoded swaps | NOT STARTED |
| A.4 | Price chart from decoded swap prices (replaces placeholder) | NOT STARTED |
| A.5 | `marketCapChangePct` real or null (fixes D2) | NOT STARTED |
| A.6 | Wire `media_mime` through registry → chain → components (fixes D3) | NOT STARTED |
| A.7 | Commit the in-flight IPFS gateway-failover route | NOT STARTED |

### Phase B — Pyth track (P0, unblocked above)
| # | Task | Status |
|---|---|---|
| B.1 | Rewrite `lib/juno/pyth.ts` onto on-chain `PriceUpdateV2` reads | NOT STARTED |
| B.2 | Freshest-shard selection + staleness + market-open state | NOT STARTED |
| B.3 | Expand feed table (AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META, SOL, USDC) (fixes D4) | NOT STARTED |
| B.4 | NAV band on the coin page | NOT STARTED |
| B.5 | Trade-panel warning when price leaves the preset's `navBandBps` | NOT STARTED |
| B.6 | Honest USD denomination for SOL-quoted pools | NOT STARTED |
| B.7 | Unit tests for decode, shard choice, staleness, band maths | NOT STARTED |

### Phase C — RPC resilience (P0 — public RPC is the demo's biggest risk)
| # | Task | Status |
|---|---|---|
| C.1 | Retry with backoff on 429 across all RPC reads | NOT STARTED |
| C.2 | Extend caching to swaps/Pyth/holders | NOT STARTED |
| C.3 | Verify the pages survive a cold load on public devnet RPC | NOT STARTED |

### Phase D — Stock wedge (P1, unblocked by Phase B)
| # | Task | Status |
|---|---|---|
| D.1 | Issuance mode in `/create`: ticker → preset → NAV feed | NOT STARTED |
| D.2 | Seed equity issuances with media across presets | NOT STARTED |

### Phase E — Verification
| # | Task | Status |
|---|---|---|
| E.1 | Juno unit tests for every new module | NOT STARTED |
| E.2 | Real-browser pass over all 5 routes | NOT STARTED |
| E.3 | **Mainnet-fork run**: launch → trade → graduate against forked mainnet state | NOT STARTED |
| E.4 | Full devnet re-run of launch/trade/claim/graduate after refactors | NOT STARTED |
| E.5 | Production build green | NOT STARTED |

### Phase F — Submission
| # | Task | Status |
|---|---|---|
| F.1 | `JUNO.md` updated to the new truth (Pyth on-chain, real analytics) | NOT STARTED |
| F.2 | Push branch `juno` to origin | NOT STARTED |
| F.3 | Deploy to Vercel | NOT STARTED |
| F.4 | Pitch video ≤3 min | BLOCKED (human) |
| F.5 | Technical video ≤5 min | BLOCKED (human) |
| F.6 | Mainnet pool | BLOCKED (user funds later — by decision, not by code) |
| F.7 | Submit on hackathons.solana.com | BLOCKED (human) |

---

## 3. Critical path

`A.1 → A.2/A.3/A.4` (one decoder feeds four surfaces) → `B.1 → B.4/B.5`
(sponsor track) → `C` (or the demo dies on rate limits) → `E.3` (mainnet-fork
proof) → `F.1/F.2/F.3`.

Phases A and B are independent of each other and are both independent of every
blocked item. Everything on the critical path is executable now.

---

## 4. USER_ACTION_REQUIRED

Collected as they are hit. Nothing here blocks anything else.

- **F.4 / F.5** — pitch + technical videos. Only you can record these.
- **F.6** — mainnet pool needs a funded mainnet key. Deferred by your decision;
  the code path will be proven on a mainnet fork first.
- **F.7** — the submission itself.
