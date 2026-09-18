# Juno — build plan

Living document. Statuses are verified by running things, not by reading code.
Last verified: 2026-09-17.

---

## 1. Goals

### What Juno is
A social app where publishing a post or reel launches a **Meteora Dynamic
Bonding Curve** pool for it. People buy the content itself. The creator earns
trading fees. When the pool raises its `migrationQuoteThreshold` it graduates
into a **DAMM v2** pool and becomes a normal AMM market that outlives the app.

### What "done" means
Entry in the Solana **STOCKLANA** hackathon (tokenized stocks on Solana).
**Deadline: Fri 25 Sep 2026, 16:00 ET.** Max 3 sponsor tracks.

Submission requires all of:
1. Public GitHub repo, README stating honestly what is on-chain vs mock
2. Live demo URL with working wallet connect
3. Pitch video ≤ 3 min (problem → product → one live transaction)
4. Technical video ≤ 5 min (optional, do it): config+pool creation, a swap, explorer links
5. **On-chain proof**: ≥1 DBC pool created *by the app*, explorer links in README
6. **Stock-shaped demo content** — an equity preset launch, not only coined photos
7. Track selection: **Meteora (mandatory)** + **Pyth** (cheap: `navBandBps` exists) + optionally one of Tessera/PreStocks
8. Open-source dependency disclosure

### What "winning" means
- **Meteora $5k** judges: originality of the DBC config, technical soundness,
  *life after the hackathon*. Their bar: **"working mainnet code beats slides."**
- **Main $100k** judges: real user problem, working end-to-end demo, a reason it
  is on Solana, execution quality. Core question: *could this be a real app people use?*

### The strategic tension
Juno is a **social content app**; the hackathon is about **tokenized stocks**.
The four curve presets are the bridge and they are genuinely original DBC work.
The demo must therefore lead with an **equity issuance**, not a coined photo.

---

## 2. Phases, tasks and status

Legend: `DONE` · `IN PROGRESS` · `NOT STARTED` · `BLOCKED`

### Phase 0 — Foundation (product surface)
| # | Task | Status |
|---|---|---|
| 0.1 | Design system, dark Juno palette scoped to `.juno` | DONE |
| 0.2 | App shell: header + brand lockup, side rail, mobile bottom nav | DONE |
| 0.3 | `/explore` with `?q=` search and `?sort=trending` | DONE (mock data) |
| 0.4 | `/reels` snap feed, one video plays via IntersectionObserver | DONE (mock data) |
| 0.5 | `/coin/[address]` page: media, stats, trade panel, 4 tabs | DONE (mock data) |
| 0.6 | `/creator/[handle]` profile with posts/reels tabs | DONE (mock data) |
| 0.7 | `/create` launch form with curve preset picker | DONE |
| 0.8 | `/activity` global trade feed | DONE (mock data) |
| 0.9 | Unit tests + production build green | DONE — 107 tests, 10 files: 66 after the Norr purge (which deleted the tests covering deleted code — was 140), +23 for the Pyth decoder/band suite, +9 for the issuer tooling, +9 for the mainnet-fork config |

### Phase 1 — On-chain core
| # | Task | Status |
|---|---|---|
| 1.1 | `lib/juno/curves.ts`: 4 presets, 16 liquidity weights each | DONE |
| 1.2 | Validate every preset against SDK `validateConfigParameters` | DONE (test) |
| 1.3 | `lib/juno/cluster.ts`: cluster switch, RPC, Solscan/Meteora links | DONE |
| 1.4 | Cluster-aware quote mints (devnet USDC ≠ mainnet USDC) | DONE |
| 1.5 | `planLaunch()` — split config + pool into 2 txs under 1232B | DONE |
| 1.6 | `sendTransaction()` / `sendLaunch()` — blockhash, signers, confirm | DONE |
| 1.7 | `fetchPoolSnapshot()` reads live pool + curve progress | DONE (verified) |
| 1.8 | `quoteTrade()` prices against the live curve | DONE (verified) |
| 1.9 | `buildSwapTransaction()` | DONE (built, never sent) |
| 1.10 | CLI `npm run juno:launch` | DONE |
| 1.11 | CLI `npm run juno:inspect` | DONE |
| 1.12 | **Launch a real devnet pool** | DONE — see §4 |

### Phase 2 — Wallet
| # | Task | Status |
|---|---|---|
| 2.1 | `JunoWalletProvider` (Phantom + Solflare), Juno-scoped | DONE |
| 2.2 | `ConnectButton` in header using Juno tokens | DONE |
| 2.3 | `useLaunch()` hook with per-step status | DONE |
| 2.4 | Create form signs and sends for real | DONE — verified via CLI on the same code path |
| 2.5 | Post-launch receipt with Solscan links | DONE |
| 2.6 | Verify connect → launch → receipt in a real browser wallet | NOT STARTED — needs a human with a funded browser wallet; same code path verified via CLI |

### Phase 3 — Persistence (kill the mocks)
| # | Task | Status |
|---|---|---|
| 3.1 | `juno_pools` table in Neon Postgres (identity/provenance only) | DONE (pushed) |
| 3.2 | `lib/juno/registry.ts` — record/list/get launched pools | DONE |
| 3.3 | `lib/juno/identicon.ts` — artwork derived from mint address | DONE |
| 3.4 | `POST /api/juno/pools` — record a launch after confirmation | DONE — verified 201 + on-chain check |
| 3.5 | `lib/juno/chain.ts` — map `JunoPoolRow` + snapshot → `Coin` | DONE |
| 3.6 | `/explore` reads real pools | DONE — verified renders AAPLx |
| 3.7 | `/coin/[address]` reads real pool by mint | DONE — verified real MC/threshold |
| 3.8 | `/creator/[handle]` reads real pools by wallet | DONE |
| 3.9 | `/activity` reads real swap history | DONE — real signatures; amounts need an indexer |
| 3.10 | `/reels` reads real `format = reel` pools | DONE |
| 3.11 | Delete `lib/juno/mock.ts` | DONE — deleted, nothing imported it |

### Phase 4 — Trading
| # | Task | Status |
|---|---|---|
| 4.1 | Trade panel calls real `quoteTrade` | DONE |
| 4.2 | Buy sends a real signed swap | DONE — verified on devnet |
| 4.3 | Sell sends a real signed swap | DONE — `xWxpJFtZB8Zzp…CRYQJg9`, slot 499958074, `err: null`, re-verified against devnet RPC. 5,000 NVDAx into pool `FGcLWvDc…RBHpK`; `juno:inspect` shows curve progress 0.0117% → **0.0114%** |
| 4.7 | Partial-fill swaps (`swap2` + `SwapMode.PartialFill`) | DONE — verified completing a curve |
| 4.8 | Creator fee claiming (`claimCreatorTradingFee`) | DONE — verified, 0.009653 SOL |
| 4.9 | Graduation (`migrateToDammV2`) | DONE — verified, DAMM v2 pool exists |
| 4.4 | Show real wallet balances (quote + coin holding) | DONE |
| 4.5 | Tx receipt + Solscan link after a trade | DONE |
| 4.6 | Execute a real devnet buy, verify on explorer | DONE — 59DBxUgP…, curve moved |

### Phase 5 — Pyth (2nd sponsor track)
| # | Task | Status |
|---|---|---|
| 5.1 | `lib/juno/pyth.ts` — Pyth client, equity + crypto feeds | DONE — reads `PriceUpdateV2` accounts on Solana (no key); Hermes only as a fallback when `PYTH_API_KEY` is set. `npm run juno:pyth` prints every feed off devnet |
| 5.2 | Map `navBandBps` presets to a Pyth feed id | DONE — stored per pool by name. Re-verified 2026-09-18: TSLA, AMZN ids were not Pyth feeds and the MSFT id was BTC/USD; corrected, so TSLAx now resolves to the real TSLA feed |
| 5.3 | NAV vs curve price on the coin page | DONE — `NavBandPanel`: reference ± confidence, curve price, signed deviation vs `navBandBps`, link to the price account. On devnet Pyth stopped pushing equities on 2026-07-02, so TSLAx/NVDAx/AAPLx honestly render **Stale** (verified in browser); the live path is unit-tested and needs mainnet, where all five equities are live on shard 1 |
| 5.4 | Warn in trade panel when price leaves the NAV band | DONE — every quote's execution price (fees in) is checked against the band; outside → alert, inside → deviation row, stale/unavailable → "Not checked — Pyth feed is stale" (verified in browser on all three equity pools) |
| 5.6 | Pyth on the `mainnet-fork` target | DONE — `lib/juno/pyth-source.ts`: fork reads live **mainnet** Pyth (same addresses; all 5 equities live on shard 1, so the band is live). Measured: `solana-test-validator --clone` copies freeze and go stale ~3 min after the fork starts. Clone list: `npm run juno:pyth -- --clone-args` (16 accounts). Live band + outside-band alert verified in browser on real TSLA/NVDA prices |
| 5.5 | SOL/USD feed so SOL-quoted pools have honest USD figures | DONE — **live on devnet with no key** (`7UVimffx…pjLiE`, ~5 min heartbeat, 600 s staleness bound). SOL pools show USD market caps; the trade panel's SOL echo is now priced, not 1 SOL = $1 |

### Phase 6 — Stock wedge
| # | Task | Status |
|---|---|---|
| 6.1 | Launch an equity-preset pool named for a real ticker | DONE (AAPLx Issuance) |
| 6.2 | Issuance mode in `/create`: pick ticker → preset → NAV feed | DONE — `758e62f`; Content/Stock switch, ticker templates (AAPL/NVDA/TSLA/MSFT), preset + `Equity.US.<T>/USD` feed id. Degrades without a Pyth key rather than blocking on 5.3 |
| 6.4 | Media upload + IPFS token metadata | DONE — Pinata; URI verified on the mint's Metaplex account |
| 6.3 | Seed 2–3 equity issuances across presets for the demo | DONE — AAPLx (ipo-book), NVDAx (thin-name) |

### Phase 7 — Graduation
| # | Task | Status |
|---|---|---|
| 7.1 | Surface migration threshold + progress from chain | DONE (in snapshot) |
| 7.2 | Graduation state on coin page when `isMigrated` | DONE — verified on a really-migrated pool |
| 7.3 | Link to DAMM v2 pool post-migration | DONE — derived via deriveDammV2PoolAddress |

### Phase 8 — Submission
| # | Task | Status |
|---|---|---|
| 8.1 | Juno README: what is on-chain vs mock, explorer links, dep disclosure | DONE — root `README.md` rewritten from Norr to Juno (`38cb298`, `834e6ef`); `JUNO.md` reconciled against it. All 27 explorer links re-verified against devnet RPC |
| 8.2 | Deploy to a public URL | NOT STARTED |
| 8.3 | Set `NEXT_PUBLIC_SOLANA_RPC` to a dedicated endpoint | BLOCKED — no RPC key in env |
| 8.4 | Pitch video ≤3 min | NOT STARTED (human) |
| 8.5 | Technical video ≤5 min | NOT STARTED (human) |
| 8.6 | One mainnet pool | BLOCKED — needs mainnet SOL + user approval. Rehearsed end to end on a mainnet fork (Block 8), so the remaining step is the real launch |
| 8.7 | Submit on hackathons.solana.com | NOT STARTED (human) |

---

## 3. Honest Measurement & Gap List

Last verified: 2026-09-18 against running devnet, Neon Postgres, and the source.

> **Read this section sceptically.** It has been materially wrong twice, in both
> directions, and both errors survived because nobody checked it against the code:
>
> 1. **Block 4 prescribed the wrong database.** It called for `juno_comments`,
>    `juno_likes` and `juno_follows` Drizzle tables in Postgres. Comments were
>    *already implemented* in MongoDB (`lib/juno/social.ts`). Building that block as
>    written would have duplicated a working layer into the wrong store and thrown
>    away a deliberate architectural decision. Corrected below.
> 2. **The completion figure was unsourced.** It read "~82% (41 / 50 technical tasks)".
>    §2 contains **66** numbered tasks, not 50, and no counting method was given, so
>    the number could not be checked. Recomputed below with the arithmetic shown.
>
> A third near-miss: `JUNO.md` claimed 4 devnet pools while this section said 7. The
> registry holds 7 — §3 was right that time and `JUNO.md` was stale. The lesson is not
> that one document is reliable; it is that **both must be checked against code, chain
> and database before being trusted.**

### Completion, with the arithmetic

Counting every numbered task in §2, plus the gap-list blocks below that §2 never
itemised. A task counts as complete only if its status line starts with `DONE`.

| Group | Complete | Total | |
|---|---|---|---|
| Phase 0 — product surface | 9 | 9 | |
| Phase 1 — on-chain core | 12 | 12 | |
| Phase 2 — wallet | 5 | 6 | 2.6 needs a human with a funded browser wallet |
| Phase 3 — persistence | 11 | 11 | |
| Phase 4 — trading | 9 | 9 | |
| Phase 5 — Pyth | 6 | 6 | on-chain reads; live equity NAV on mainnet/fork, stale-and-said-so on devnet |
| Phase 6 — stock wedge | 4 | 4 | |
| Phase 7 — graduation | 3 | 3 | |
| **Phases 0–7 subtotal** | **59** | **60** | **98.3%** |
| Block 3 — swap indexer | 4 | 4 | built and verified on two devnet pools |
| Block 4 — social | 3 | 3 | comments, likes and follows all persisted |
| Block 5 — legacy purge | 1 | 1 | done; build green |
| Block 7 — issuer tooling | 4 | 5 | I.5 needs a human with the creator's browser wallet |
| Block 8 — mainnet-fork rehearsal | 1 | 1 | full issuance lifecycle on cloned mainnet state |
| **Engineering total** | **71** | **73** | **97.3%** |

**Engineering: 71 / 73 = 97.3%.** The open items are 2.6 and I.5 (browser-wallet
signatures, need a human). 5.3 and 5.4 were unblocked by reading Pyth on-chain instead
of via Hermes.
Caveat that matters for the demo: on devnet the equity feeds are months stale, so the
band renders "Stale" rather than a number, and the existing equity pools are priced
~$0.000005/token against a ~$300 underlying — the band only becomes meaningful once
issuance anchors the opening price to NAV (see the Pyth report).

**Submission readiness is much lower, and is the real risk.** Phase 8 is **1 / 7 =
14%**. The one done item is the README. Still open: deploy to a public URL (8.2), a
dedicated RPC (8.3), the ≤3 min pitch video (8.4), the ≤5 min technical video (8.5),
a mainnet pool (8.6), and actually submitting (8.7). Four of those need a human and
two need funds or credentials. **Deadline: Fri 25 Sep 2026, 16:00 ET.**

These two numbers must not be blended. A judge cannot see 85% of engineering; they
see a repo, a URL and a video, and two of those three do not exist yet.

### What the evidence actually supports

Verified on chain, in Postgres, and by running the test suite:

- **8 live devnet DBC pools**, all in `juno_pools`, all four presets exercised. All 8
  creation signatures confirmed `err: null` against `api.devnet.solana.com`.
- **A real buy**: NVDAx 0.5 SOL (`59DBxUgP…QJwdGzV`), curve 0.0000% → 0.0117%.
- **A real sell**: 5,000 NVDAx (`xWxpJFtZ…CRYQJg9`, slot 499958074), curve back to
  0.0114% — independently corroborated by `juno:inspect`.
- **A full graduation**: driven 0% → 100.0000%, migrated to DAMM v2 pool
  `EhvtVimk…MYy7L` (`4HatkGNZ…bMVTZtc`). `juno:inspect` reports `graduated true`.
- **Creator fees claimed**: 0.009653 SOL (`3X4g3aDg…9HdAN`).
- **IPFS**: token metadata and three reel videos pinned and resolving.
- **107 unit tests across 10 files passing**, including Meteora's own
  `validateConfigParameters` over all four presets.

---

### Itemized Remaining Gaps

#### Block 3: Swap-event indexer, price chart, 24h volume, activity detail — DONE
Owner: juno-4. (Previously juno-1, which was killed after stalling.) Commit `72683ae`.
- [x] `lib/juno/indexer.ts` — swap history via `getSignaturesForAddress` plus
      `getParsedTransaction`, parsed into direction, base amount, quote amount,
      execution price, trader and block time.
- [x] 24h volume on `/coin/[address]` and `/explore`. The trending sort now actually
      reads volume, only when asked for, sequentially and capped.
- [x] Trade direction and size in `/activity` and the coin Activity tab — the
      unfinished remainder of 3.9, which was DONE for signatures only.
- [x] Real SVG price chart in `CoinMedia.tsx`, replacing `PriceChartPlaceholder`.
- [x] 17 unit tests for the indexer, all of which survive the purge below.

**How it parses.** Not by decoding the program's Anchor event — by differencing
pre/post token balances, which are consensus data present in a response we already
have to fetch and cannot drift when Meteora changes an event layout. The pool's two
vaults share one authority PDA, so that authority is the only owner in a swap holding
both mints: quote into the vault is a buy, quote out is a sell. Pool creation, fee
claims and migration each move only one leg and are rejected rather than showing up as
phantom trades.

**Verified on chain, not just compiled.**
- NVDAx `FGcLWvDc…RBHpK` — both known trades, matching their signatures:
  BUY 237,911.471147 base / 0.5 SOL at 2.101622e-6; SELL 5,000 base / 0.009941764 SOL
  at 1.988353e-6. 24h volume 0.509941764 SOL, change −5.39%.
- Graduated `F6A77CbT…8ZowZ` — 9 buys, price climbing 2.31e-9 → 4.16e-9 as the
  back-loaded `content` curve steepens, ending in the 0.000004224 SOL partial fill that
  completed it.
- End to end through the running app: `GET /api/juno/swaps` returns both NVDAx swaps
  with volume, change and chart points; `/activity` renders exactly one buy and one
  sell.

**The RPC finding, because it changes what is achievable here.** `getParsedTransactions`
— the batched form — is refused outright by the public devnet endpoint: a batch of 12
returns `Too many requests for a specific RPC call`, and smaller batches with backoff
do not help, because the limit is on the batched method. Sequential singles get
through, but spacing them out makes it *worse*. Measured over the same 12 signatures:

| gap | ok | fail |
|---|---|---|
| 200ms | 10 | 2 |
| 400ms | 0 | 12 |
| 700ms | 0 | 12 |

That is a **quota, not a rate window**. Once spent, politeness does not help. So there
is no configuration that makes this reliable on the public endpoint, and **task 8.3
(`NEXT_PUBLIC_SOLANA_RPC`) is now the thing standing between this feature and it
working consistently.** It was a nice-to-have; it is now load-bearing.

**Honesty boundary, deliberately drawn between trades and aggregates.** A transaction
the RPC refuses is counted, not thrown — discarding nine trades that were read because
the tenth was rate-limited would be throwing away truth to punish a partial failure. So
rows and chart points show what is real, while `volume24h` and `totalVolume` return
null whenever the window has holes or does not reach back far enough. Null renders as
an em-dash; only a complete read of a pool that has not traded renders `$0`.

#### Block 4: Social — DONE
Commit `6f7d352`. All three live in MongoDB beside each other.

> **Still do not build this in Postgres.** An earlier version of this block called
> for `juno_comments` / `juno_likes` / `juno_follows` Drizzle tables. That was wrong
> then and is wrong now.

| Item | Status | Evidence |
|---|---|---|
| **Comments** | **DONE** | `listComments`/`addComment`/`countComments`, wired to `app/api/juno/comments`. |
| **Likes** | **DONE** | `likeState`/`toggleLike`/`likeCounts` + `app/api/juno/likes`. Keyed `(coinMint, cluster, wallet)` with a **unique index**, so the idempotency lives in the database rather than in application code that could race. |
| **Follows** | **DONE** | `followState`/`toggleFollow` + `app/api/juno/follows`. Keyed `(followerWallet, creatorWallet)`, unique. Self-follow rejected. |

**Verified by running it, against real MongoDB — not mocked.**
- Like toggles: `{count:0,liked:false}` → `{count:1,liked:true}` → `{count:0,liked:false}`.
- **Concurrency:** six simultaneous toggles from one wallet, with a second wallet
  also holding a like. The count never exceeded the number of distinct wallets,
  which is the guarantee the unique index exists to provide.
- Follow: 0 → 1 → 0 → 1; self-follow returns 400 `A wallet cannot follow itself`;
  a malformed address returns 400.
- **Rendered output:** `/reels` server HTML carries real seeded counts (`0`, `0`, `2`)
  with all three like buttons `disabled` and labelled *Connect a wallet to like*.
  `/creator/<wallet>` rendered `1 Followers` from the database, replacing the
  hardcoded `0`.

**No-wallet behaviour is honest by construction.** The count renders for everyone;
only the action is gated. There is no optimistic increment anywhere — every toggle
takes the new count back from the server response, because with two tabs open an
optimistic count drifts and then quietly stays wrong. A like is one round trip; it
can afford to be correct.

Synthetic rows created while testing were deleted afterwards. What remains is one
like per coin from the deployer wallet, which is a real wallet that really launched
those pools.

#### Block 8: Mainnet-fork rehearsal — 1 / 1
Owner: juno-7. Run STOCKLANA issuance against real mainnet addresses on a local validator,
behind cluster-aware config. How to run it: DEPLOY.md, *Rehearsing on a mainnet fork*.

| # | Task | Status |
|---|---|---|
| F.1 | `mainnet-fork` cluster + `juno:fork` clone list, proven by running the flow | DONE — `lib/juno/cluster.ts` separates `usesMainnetAddresses()` (USDC, Pyth) from the endpoint (local RPC) and explorer (Solana Explorer, `cluster=custom`); `isMainnet()` stays true only on real mainnet, so the launch script still refuses a mainnet airdrop. `lib/juno/fork.ts` lists 25 accounts, all confirmed present on mainnet by a read-only `getMultipleAccountsInfo`. On `solana-test-validator`: `content` launch → fill to 100% → claim 0.439014696 SOL → migrate into DAMM v2 `5BeBWkeH…iTUgwvu` (exists); a USDC-quoted `ipo-book` issuance with `Equity.US.AAPL/USD` on mainnet USDC; `juno:pyth` reads mainnet AAPL $336.25 from the clone; `/api/health` → `cluster: mainnet-fork`. The first run failed to migrate (`Transfer: insufficient lamports 0`) because the funded DAMM v2 pool authority PDA was not cloned; the list now includes it and the DBC pool authority |

#### Block 7: Issuer tooling — configure and monitor DBC pools from the app — 4 / 5
Owner: juno-7. The Meteora brief asks for "tooling that helps issuers configure and
monitor DBC pools". Before this, claiming and graduating only really worked from CLI
scripts signed by `.juno/launcher.json`. Full log: `/tmp/juno-issuer-report.md`.

| # | Task | Status |
|---|---|---|
| I.1 | One shared code path: `lib/juno/issuer.ts`; `juno:inspect` / `juno:claim` / `juno:graduate` become thin wrappers over it, with a `--simulate` dry run | DONE — the scripts and the Manage view call the same `readIssuerState`, `claimCreatorFees` and `graduatePool`. `juno:graduate` no longer takes `--preset`: the DAMM v2 fee tier is read from the pool's `migrationFeeOption`, because the old `content` default was the wrong tier for three of the four presets |
| I.2 | Pool monitor at `/coin/<mint>/manage` | DONE — curve progress vs `migrationQuoteThreshold`, quote reserve, price, fee decay (opening / now / floor + live countdown), preset matched **from the on-chain config**, the 16 liquidity weights, and the curve chart. Browser-verified on GRADTN while it was still decaying (5.00% → 1.50% now → 0.60% floor, "6m 13s until the floor") and on AAPLx (USDC, `ipo-book`). Console and network clean apart from dev-mode warnings |
| I.3 | Claim creator fees from the UI, same path as `juno:claim` | DONE — CLI sends through the refactored path: NVDAx 0.000504652 SOL (`2Cc6mq3g…7ckGR`, lamports +499,652 net of fee) and GRAD 0.05382363 SOL (`5sQqxR6Q…Sqw7`, remaining 0). The browser-built claim transaction (617 bytes) simulates `err: null`, 34,945 CU, `ClaimCreatorTradingFee` |
| I.4 | Migrate to DAMM v2 from the UI once at 100%, then link to the DAMM v2 pool | DONE — new `thin-name` pool GRADTN (`8Y4XdeMd…hB9mx`) filled to 100% (`5N9E8HeE…PvndB`) and migrated through `graduatePool` (`2hSPTWnq…RYQmen`, `err: null`) into DAMM v2 pool `9UE389Y8…w1Ha` (owner `cpamdp…`, tier option 1). The browser-built migrate transaction simulates `err: null`, 137,744 CU, before the real one was sent. The Manage view, GraduatedNotice and the Details tab now link the DAMM v2 pool; the Details tab showed the DBC pool address under that label before |
| I.5 | A human signs a UI claim/migrate with the creator's browser wallet | OPEN — automation used a watch-only Wallet Standard wallet (public key only). The transaction reaches the wallet, simulates clean, and the wallet refuses to sign. Every Juno pool's creator is the launcher key, which is not in a browser wallet: import `.juno/launcher.json` into Phantom (devnet), or launch a pool from `/create` with your own wallet |

#### Block 5: Purge dead non-Solana code (Norr / Algorand / x402 / Privy / Clerk / Stripe) — DONE
Taken over by juno-4 after juno-3 stalled in `needs_input` for 40 minutes without
committing. Commits `efce235`, `24e646b`, `1e985f3`.

**237 files and 33,173 lines deleted; dependencies 54 -> 18.**

- [x] `lib/algorand.ts`, `lib/x402.ts`, `lib/custodial*`, `lib/avm*`, `lib/constants.ts`
      and 16 more dead libs
- [x] `app/api/x402`, `app/api/account`, `app/add-funds`, `app/withdraw` — 16 page
      routes and 24 API route trees in total
- [x] `components/WalletProviders.tsx` and `components/ConnectWalletButton.tsx`, plus
      39 other components, chosen by computing reachability from the real entry points
      rather than by eye
- [x] Root layout de-Norred: AgeGate gone, metadata/manifest/OG card say Juno, `/`
      redirects to `/explore`, icons redrawn as the Juno mark
- [x] `package.json` renamed to `juno`; 36 dependencies and 12 dead scripts removed
- [x] `.env.local.example` now tracked, with the `!.env.local.example` negation the
      `.env*` rule required
- [x] **`npm run build` green, `npm test` green (7 files, 66 tests)**

**This also fixed the red build.** The failure was `useWallet must be used within the
WalletProvider`: `758e62f` gutted `WalletProviders` while `ConnectWalletButton` still
called `useWallet`. Both are deleted, along with the page that rendered them.

Two deletions beyond the original spec, forced by evidence rather than preference:
`lib/db/{calls,feed-policy,messages,queries,social,user-profile}.ts` were dead *and*
imported deleted modules, so keeping `lib/db` wholesale failed the typecheck; and
`lib/blob.ts` was the only thing keeping `@vercel/blob` alive.

Left deliberately, for the orchestrator to rule on rather than for me to decide:
`components/ui/{Avatar,Button,discussion}.tsx` are unreachable, but the purge spec's
KEEP list named `components/ui/**` explicitly. `lib/juno/media.ts` is also orphaned,
but it is Juno code rather than Norr surface.

#### Block 6: Submission readiness — README DONE, everything else open
- [x] Root `README.md` rewritten as Juno: DBC presets as the centrepiece, both
      engineering findings, honest real/not-real split, 7-pool table, dependency
      disclosure (`38cb298`, `834e6ef`).
- [x] `JUNO.md` reconciled against it — pool count 4 → 7, the sell added, social rows
      corrected, stale `.env.local.example` instruction fixed.
- [x] `npm run build` verified green end-to-end, and `npm test` with it (7 files,
      66 tests). The `useWallet must be used within the WalletProvider` prerender
      failure is fixed — `WalletProviders` and `ConnectWalletButton` are both deleted
      in Block 5, along with the page that rendered them. **8.2 deploy is unblocked.**
- [ ] 8.2 deploy, 8.4 pitch video, 8.5 technical video, 8.6 mainnet pool, 8.7 submit.

#### Legitimate blockers (do NOT fake or bypass)
- ~~`PYTH_API_KEY`~~ — no longer a blocker: Pyth is read on-chain. Optional Hermes fallback only.
- `NEXT_PUBLIC_SOLANA_RPC` — running on the public devnet endpoint, which rate-limits.
- Mainnet SOL (8.6) — real funds, needs explicit authorization.
- 8.4, 8.5, 8.7 and 2.6 need a human.

---

## Browser verification — 2026-09-18

A full pass over every route in a real browser, run after the indexer, likes and
follows, the Norr purge and the de-Norred shell had all landed. Build and tests
passing had not proved the pages work — and they did not all work.

**Final result: 18/18 items PASS on live devnet data, plus B18 (RPC failure) PASS on
all 10 pages under both a total and a partial outage. Eight real bugs found and fixed
at the root.** Run against a production build (`next build && next start`), HEAD
`b732a1d`.

### How it was run
- **Pass criteria were written before looking** (`.juno-verify/criteria.md`, local).
  Any console error, page error, failed request or own-origin 4xx/5xx fails an item.
- **Not the AO browser panel.** It cannot verify this app: every React page stays on
  its Suspense fallback, snapshots return "(empty page)", and screenshots fail even on
  a plain JSON URL. Four app-level causes were ruled out one at a time (CSP, service
  worker, stale chunks, X-Frame-Options), then an independent headless Chrome rendered
  the same page completely. The pass uses Playwright driving the installed Google Chrome.
- **RPC failure tested deterministically**, not by waiting for a rate limit: a
  fault-injecting RPC answered every call (total) or half of them (partial) with the
  exact 429 body devnet returns.

### Results
| # | Item | Result | Evidence |
|---|---|---|---|
| B1 | `/` | PASS | redirects to `/explore`, title "Explore · Juno", no Norr UI |
| B2 | `/explore` | PASS | 8 tiles (every registry pool), a 24h cell on each |
| B3 | `?q=nvda` | PASS | "1 result for “nvda”", only NVDAx |
| B4 | `?q=zzzz` | PASS | "Nothing matches" empty state |
| B5 | `?sort=trending` | PASS | full ranking; see bug 8 for the latency fix |
| B6 | `?sort=graduating` | PASS | graduated pool sorts last |
| B7 | `/reels` | PASS | 3 reels, exactly 1 playing, like counts real, like disabled w/o wallet |
| B8 | `/coin` AAPLx (`ipo-book`, USDC) | PASS | renders; chart drawn |
| B9 | `/coin` NVDAx (`thin-name`, SOL) | PASS | price chart (3 points), 24h volume 0.210 SOL, **BUY and SELL rows** with sizes |
| B10 | `/coin` graduated pool | PASS | graduated state, DAMM v2 link to `EhvtVimk…MYy7L` |
| B11 | `/creator/9CHr…` | PASS | 8 posts (registry truth), real follower count, Follow disabled w/o wallet with honest title |
| B12–14 | `/create` post / reel / stock | PASS | 4 presets; Reel mode selects; Stock Issuance shows AAPL/NVDA/TSLA/MSFT and NVDA picks `thin-name` |
| B15 | `/activity` | PASS | 16 rows, 12 decoded; NVDAx **SELL 5,000** row present |
| B16 | `/coin/not-a-mint` | PASS | **HTTP 404** + not-found page |
| B16b | `/coin/<well-formed, unknown>` | PASS* | not-found page + `noindex`; HTTP 200 — see limitation |
| B17 | `/creator/not-a-wallet` | PASS | **HTTP 404** + not-found page |
| B18 | RPC failure, all 10 pages | PASS | total and partial outage: no crash, no false "No coins yet / No reels yet / Nothing has traded yet / 0 Posts"; every data-less view says why |
| B19 | `/api/health` | PASS | 200, database ok, rpc ok |

### Bugs found and fixed
| # | Bug | Root cause | Commit |
|---|---|---|---|
| 1 | CSP violation logged on every page | wallet-adapter CSS `@import`s Google Fonts; CSP blocks it | `bd88421` |
| 2 | Coin page crashed on an RPC 429 | uncaught throw from the snapshot read | `68d82cb` |
| 3 | Lists silently dropped coins — "2 Posts" for a wallet with 8; "No coins yet" in outages | `hydratePools` treated "RPC refused" as "does not exist" | `68d82cb` |
| 4 | Activity said "Nothing has traded yet" during outages | fallback returned `[]` on failure | `68d82cb` |
| 5 | **Every creator link was broken, always** | linked `/creator/9CHr…WYoE` (display handle), not the wallet | `0361938` |
| 6 | Malformed addresses returned HTTP 200 | `loading.tsx` commits 200 before `notFound()` | `c038635` |
| 7 | **A trade could go out with `minimumAmountOut = 0` — no slippage protection** | failed/unloaded quote fell back to 0; Buy not gated on a quote; stale quote could be ~10× too weak | `f8f78a8` |
| 8 | Trending sort took 36s cold | awaited every pool's sequential history walk | `b732a1d` |

**Bug 7 is the one that mattered most.** The code justified the zero fallback with a
comment saying the program "rejects rather than filling at any price". Simulating a
0.001 SOL buy (never sent) disproved it: `minimumAmountOut = 0` returns `err: null`;
an unreachable minimum returns `ExceededSlippage`.

Bug 5 was invisible until bug 6's fix: the new proxy made the broken link's prefetch
return a real 404, and it surfaced in the console on every coin page.

Bug 8 measured with curl: **36.4s cold / 16.6s warm → 8.4s cold / 3.0s warm.** The
first visit ranks what it can read in a 5s budget and says how many coins were not
ranked; the rest finish in the background and the next visit ranks everything.

### Not verified, and why
- **The connected-wallet trade path.** A headless browser has no wallet (the same
  blocker as task 2.6). The slippage fix rests on the simulation above plus a backstop
  in `TradePanelClient` that refuses to swap without a quote whatever the UI state.
- **Comments round trip.** Code-reviewed, not exercised: it would write a test comment
  into the shared database.

### Accepted limitation
Well-formed but unknown mints return HTTP 200 with `noindex` and the not-found page. A
true 404 needs a Postgres lookup in `proxy`, which Next's docs say proxy is not for,
and it would add a round trip to every coin view. This is the framework's documented
behaviour for streamed routes.

### Flagged, not changed
TradePanel pre-fills a buy amount of 20, so every coin page view fires a browser-side
quote — about 9 devnet RPC calls, traced with CDP. That contradicts `useTrade`'s stated
design of not fetching on mount, and it spends the shared public quota. It is a UX
decision in a file juno-6 is editing, so it is reported here rather than changed.

---

## 4. On-chain facts (devnet)

First pool launched by the app's own code path, 2026-09-17:

| | |
|---|---|
| Preset | `ipo-book` (16 segments, 4% → 0.5% fee) |
| Name / ticker | AAPLx Issuance / AAPLXI |
| Quote | devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Base mint | `CMjWQU2Bzd1NWwy1GB2qFNcpgRtW6xm9dhcjnevtBcbp` |
| Pool | `9DnKw5r5rYx1JoGmwLU2yCXFhKDkypaycuebrwrZSxFa` |
| Config | `7cu21NeoDjZ74VckNXhAnfo7Ahq5r5T1xTBAKnpnFmsS` |
| Config tx | `2X1zcRbEQoT527dvtRMnxAihmu4t91ZfeKxDvMSmTP7CFnXBK8zaHuYjQ86mvyizfnWrY6LdpzqrrZ61QNa7Shtz` |
| Pool tx | `4NiD7oZBfbGc7gNtVSyDgtTFohUSMYHMBEpxGQN6qsDbmYBTncLSpjuQXQovS39FvGZeCedmsAqT7msqX5dxRAh3` |
| Deployer | `9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE` (10 SOL devnet) |

Verified read-back: threshold $4124.999999, progress 0%, quote for 10 USDC →
9,564,026 tokens, fee 0.309, price impact 4.36%.

### Engineering note worth keeping
`createConfigAndPool` **cannot** carry a 16-segment curve: the bundled message
serialises to ~1488 bytes against Solana's 1232 limit. `creator.createPool`
alone does not work either — it reads the config account from chain, which does
not exist at build time. The working path is
`createConfigAndPoolWithFirstBuy` with no first buy, which returns the two
transactions *separately* (config 1109B, pool 673B) and takes `tokenType` from
params instead of fetching. Dropping curve points to fit one transaction would
have gutted the exact thing Meteora is judging.

---

## 5. Execution order

Phases 0–7 are done bar the blocked and human items, so what follows is what is
actually left, ordered by judge impact per hour.

1. **8.2 deploy to a public URL** — the submission requires a live demo. Nothing else
   on this list matters if a judge cannot open the app. **Unblocked and prepared:**
   the build is green, and [`DEPLOY.md`](./DEPLOY.md) has the exact steps and every
   variable to set. Not executed — publishing is the owner's call and has not been
   authorised.
2. **8.3 a dedicated RPC** — promoted from nice-to-have. The swap indexer is built,
   but the public devnet endpoint's per-method quota means it degrades to em-dashes
   as often as not. One endpoint key turns a working feature into a visibly working
   one. (Block 3 itself: **done**, `72683ae`.)
3. ~~Block 5, the legacy purge~~ — **done** (`efce235`, `24e646b`, `1e985f3`). The
   repo is Solana-only and the build is green.
4. **8.4 / 8.5 videos**, **8.7 submit** — human, and hard-deadlined 25 Sep 16:00 ET.
5. **8.6 mainnet pool** — Meteora's stated bar is "working mainnet code beats slides".
   Blocked on funds and authorization; the highest-value unblock available.
6. ~~Block 4 likes and follows~~ — **done** (`6f7d352`).
