# Juno — execution plan

**Written:** 2026-09-21, replacing the pre-mobile plan of the same name.
**Deadline:** Fri 25 Sep 2026, 16:00 ET (STOCKLANA). **~4 days.**

Self-contained. A builder agent should be able to execute any single task
below without the conversation that produced it.

---

## 1. What "done" and "winning" mean for *this* project

Juno is a social app where **every post is a live market**. Publishing launches
a Meteora Dynamic Bonding Curve pool; people buy into the content as they
scroll; the creator earns trading fees instead of ad revenue; at
`migrationQuoteThreshold` the pool graduates into Meteora DAMM v2 and outlives
the app.

For STOCKLANA the product has a second half that matters more to the judges:
**equity-shaped curve presets marked against a real reference.** `thin-name`,
`ipo-book` and `tight-nav` are issuance shapes, and a coin can be marked
against Pyth (listed names) or Tessera (pre-IPO names Pyth has no feed for).

**Winning conditions, concretely:**

| Track | Prize | What it actually requires | Where we stand |
|---|---|---|---|
| Meteora — Best Use of DBC | $5,000 | Novel curve/fee config or issuer tooling. *"Working code on mainnet beats slides."* Judged on originality, technical soundness, life after the hackathon. | Four presets, depth tooling, NAV band. **Devnet only — this is the gap.** |
| Tessera — Pre-IPO Stocks | $6,000 | A product using OpenAI or Kalshi T-Tokens, driving value to them. | Three live markets marked against T-OpenAI / T-Kalshi / T-SpaceX. |
| Main track | $100,000 | Real problem, working end-to-end demo, a reason it is on Solana, execution quality. | Strong, but needs a deployed demo URL. |
| Pyth | Pyth Pro | *"Live financial data does real work."* | On-chain `PriceUpdateV2` reads gate a band that gates a trade warning. |
| PreStocks / Clawpump | $5,000 each | Their APIs. | Untouched. Deliberately — see §5. |

**The submission needs:** a GitHub link, plus a live demo URL or video.

---

## 2. Phases

### Phase A — Sponsor depth  ·  DONE
### Phase B — Reliability  ·  DONE
### Phase C — Mainnet  ·  BLOCKED on funding
### Phase D — Deploy + submit  ·  PARTIAL
### Phase E — Curve science  ·  NOT STARTED
### Phase F — Polish  ·  PARTIAL

---

## 3. Tasks

### Phase A — Sponsor depth

- **A1 · DONE** — Tessera reader (`lib/juno/tessera.ts`). Both public endpoints
  merged, no API key. 90s cache, empty reads held 10s.
- **A2 · DONE** — `tesseraOnChain`: reads the mint on mainnet for transfer fee,
  freeze authority, mint authority, extensions. Derives *why* a T-token cannot
  be a DBC quote mint rather than repeating it from docs.
- **A3 · DONE** — NAV band routes on the reference: `tessera:T-OpenAI` → Tessera,
  a feed id → Pyth. `state: "mark"` and `ageSeconds: null` for a source that
  publishes no timestamp.
- **A4 · DONE** — `nav_units_per_token`. The band compared a curve token's price
  against a *share* price and reported every tracker "-100.00%, outside band".
  Fixed at launch as whatever makes the market open at parity.
- **A5 · DONE** — `/api/juno/tessera`: marks, on-chain facts, derived
  `shareOfCompany` and `floatUsd`, and the Juno markets against each name.
- **A6 · DONE** — Three devnet markets, one per name and per preset:
  - `OPENAIX` tight-nav `4BvmeTbEXzYJvhYQmiYNjG9DGVVFjfgpeCnXH57yKLea`
  - `KALSHIX` thin-name `4msUJ9WNZxKDEPKpmkvUbh18snvzYBgFEracLXwbc3aF`
  - `SPACEXX` ipo-book `FFpJbMH35kLP6tB5LLnXJSZy6BKVtwcaFHTz98tDjTVY`
- **A7 · DONE** — Depth tooling surfaced in the buy sheet.
- **A8 · NOT STARTED** — A Pre-IPO screen in the app listing the three T-tokens
  with mark, holders, valuation, float and the markets on each. The endpoint
  exists and nothing renders it. *Highest-value remaining Tessera work.*
- **A9 · NOT STARTED** — Depth curve chart in the Details tab. `sampleDepth`
  returns 12 log-spaced points; nothing draws them.

### Phase B — Reliability

- **B1 · DONE** — `juno_swaps`: decoded fills persisted, keyed by signature.
- **B2 · DONE** — `juno_scanned`: signatures examined, so launch transactions
  are not re-parsed forever.
- **B3 · DONE** — `/api/juno/index`: one pass per pool, safe to re-run.
- **B4 · DONE** — Leaderboard ranks every pool and reports `poolsRead/poolsTotal`.
- **B5 · NOT STARTED** — Pool snapshots are still one chain read per pool per
  request; that is the remaining 15–30s in `coins` and `feed`. Cache pool state
  in Postgres with a short TTL, same shape as B1.
- **B6 · BLOCKED** — Dedicated RPC. Public devnet is the binding constraint.
  Ankr refuses `getSignaturesForAddress` without auth; extrnode/Helius/Alchemy
  keyless all 404. **Needs a credential that is not in the repo.**

### Phase C — Mainnet

- **C1 · BLOCKED** — Fund a mainnet launcher. ~0.1 SOL covers config + pool
  rent + fees for one launch; three pools ≈ 0.25 SOL. Key would be generated
  fresh and its address handed over before funding.
- **C2 · BLOCKED on C1** — Launch one mainnet pool per preset, quoted in SOL.
- **C3 · BLOCKED on C1** — One real mainnet buy, so the demo has a mainnet
  signature a judge can click.
- **C4 · NOT STARTED** — `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` path tested
  end to end. The registry is cluster-scoped already, so devnet pools stay
  hidden rather than mixing.

### Phase D — Deploy and submit

- **D1 · DONE** — Deployed to Railway.
  **https://juno-web-production-bd2e.up.railway.app**
  Project `3dcca757-3f03-44a4-ae57-fd82e670c49b`, service `juno-web`.
  Two build failures on the way, both fixed: a 6GB upload (`.railwayignore`,
  now 3.8MB) and an npm peer conflict between `@solana-program/token-2022`'s
  `sysvars@^5` and `@solana/kit@6` (`.npmrc`, `legacy-peer-deps`). A third
  failure was Railway's own builder taking a 504 from GitHub fetching `mise`
  and needed only a retry.
- **D2 · DONE** — 19 variables set, `PORT=3000` pinned to match the domain's
  target port.
- **D3 · DONE** — The swap record lives in the same Neon database, so the
  deployed instance reads a warm store: its feed returns `tradesPartial:
  false`.
- **D6 · DONE** — `juno-expo/.env` points `EXPO_PUBLIC_API_URL` at Railway, so
  the phone no longer depends on a laptop's dev server being up and on the
  same network.
- **D4 · NOT STARTED** — Submission text. Lead with the two things nobody else
  will have: a curve marked against a company that has not listed, and fills
  decoded from vault deltas with no indexer.
- **D5 · NOT STARTED** — Video walkthrough, in case the live demo is throttled.

### Phase E — Curve science  *(the Meteora judging criteria, directly)*

- **E1 · NOT STARTED** — Preset comparison at a *controlled* threshold. The
  three trackers absorb 9.86 / 17.54 / 20.29 SOL per 1% move, but they have
  different migration thresholds, so that is not yet a comparison of the
  shapes. Quote all four presets against one config and publish the table.
- **E2 · NOT STARTED** — Answer the open question in `docs/juno-brief.md`:
  does `tight-nav`'s uniform weighting actually produce near-flat price, or
  does constant-product geometry defeat it? E1 measures it. If the answer is
  no, say so and rename or refit the preset — a preset named for an outcome it
  does not deliver is worse than not having it.
- **E3 · NOT STARTED** — Exact-out buys (`SwapMode.ExactOut`): "buy exactly 1M
  tokens". Real DBC surface area, small work.

### Phase F — Polish

- **F1 · DONE** — Seven UI changes from the reference designs.
- **F2 · NOT STARTED** — Graduation → DAMM v2 verified end to end. Script
  exists (`scripts/juno-graduate.ts`), unverified this run.
- **F3 · NOT STARTED** — Creator fee claim verified. `scripts/juno-claim.ts`
  exists, unverified this run.
- **F4 · NOT STARTED** — Toast system for the transaction lifecycle.

---

## 4. Gap list

Each tied to the task it blocks.

| Gap | Where | Blocks | Severity |
|---|---|---|---|
| No mainnet pool | — | C2, and Meteora's explicit criterion | **Highest.** Needs funding only. |
| No deployed URL | `vercel.json`, nothing live | D1, and the submission itself | **Highest.** Needs a credential. |
| Public RPC only | `lib/juno/cluster.ts` `rpcEndpoint()` | B6; causes every 15–30s response | High. Credential absent. |
| Pool state re-read per request | `lib/juno/dbc.ts` `fetchPoolSnapshot` | B5 | High. Pure code, no credential. |
| Tessera endpoint has no screen | `/api/juno/tessera` | A8 | High — it is the $6k track's shop window. |
| Depth points not drawn | `lib/juno/depth.ts` `sampleDepth` | A9 | Medium. |
| Presets never compared fairly | `lib/juno/curves.ts` | E1, E2 | Medium — it is Meteora's first criterion. |
| Graduation unverified | `scripts/juno-graduate.ts` | F2 | Medium. |
| Fee claim unverified | `scripts/juno-claim.ts` | F3 | Medium. |
| `/coin/*` web route times out | `app/(juno)/coin/[address]` | D1 | Medium — 120s+ under throttle; B5 likely fixes it. |
| 9 e2e failures | `tests/e2e/api.test.ts` | — | None for Juno. Algorand custodial tests, `fetch failed`, unrelated. |

**Mocks, stubs, fakes, TODOs: none.** Grep across `lib/juno`, `app/api/juno`,
`app/(juno)`, `juno-expo` returns only CSS `placeholder:` classes and comments
that explicitly say "not a placeholder". Every figure is read from chain, from
Postgres, from Mongo, or from Tessera's API.

---

## 5. Decisions, so they are not re-litigated

- **A T-token cannot be a DBC quote mint.** All three are Token-2022 with a
  20 bps transfer fee; `is_supported_quote_mint` rejects any quote mint with a
  live fee, the `?` propagates before the token-badge branch, and badge
  creation calls the same predicate. DBC also always mints its own base token.
  Dead end in both roles — verified in the program source and against the SDK's
  own error variants. Tessera is integrated as a *reference*, which is where it
  belongs.
- **PreStocks and Clawpump are skipped.** Two tracks at $5k each, ~4 days, and
  both would be bolted on. Tessera is already the pre-IPO story and doing it
  twice makes neither convincing.
- **No indexer, and still none.** Fills come from vault deltas. `juno_swaps` is
  a record of what was decoded, not a second source of truth.
