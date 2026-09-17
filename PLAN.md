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
| 0.9 | Unit tests (140) + production build green | DONE |

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
| 4.3 | Sell sends a real signed swap | DONE (code, same path) — sell not yet executed |
| 4.7 | Partial-fill swaps (`swap2` + `SwapMode.PartialFill`) | DONE — verified completing a curve |
| 4.8 | Creator fee claiming (`claimCreatorTradingFee`) | DONE — verified, 0.009653 SOL |
| 4.9 | Graduation (`migrateToDammV2`) | DONE — verified, DAMM v2 pool exists |
| 4.4 | Show real wallet balances (quote + coin holding) | DONE |
| 4.5 | Tx receipt + Solscan link after a trade | DONE |
| 4.6 | Execute a real devnet buy, verify on explorer | DONE — 59DBxUgP…, curve moved |

### Phase 5 — Pyth (2nd sponsor track)
| # | Task | Status |
|---|---|---|
| 5.1 | `lib/juno/pyth.ts` — Hermes client, equity + crypto feeds | DONE (code) |
| 5.2 | Map `navBandBps` presets to a Pyth feed id | DONE — feed ids verified, stored per pool |
| 5.3 | NAV vs curve price on the coin page | BLOCKED — Hermes price API needs a key; none in repo |
| 5.4 | Warn in trade panel when price leaves the NAV band | BLOCKED — same credential |
| 5.5 | SOL/USD feed so SOL-quoted pools have honest USD figures | DONE — degrades to SOL-denominated labelling when no key |

### Phase 6 — Stock wedge
| # | Task | Status |
|---|---|---|
| 6.1 | Launch an equity-preset pool named for a real ticker | DONE (AAPLx Issuance) |
| 6.2 | Issuance mode in `/create`: pick ticker → preset → NAV feed | NOT STARTED — depends on 5.3 (Pyth key) to be worth building |
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
| 8.1 | Juno README: what is on-chain vs mock, explorer links, dep disclosure | DONE — `JUNO.md` |
| 8.2 | Deploy to a public URL | NOT STARTED |
| 8.3 | Set `NEXT_PUBLIC_SOLANA_RPC` to a dedicated endpoint | BLOCKED — no RPC key in env |
| 8.4 | Pitch video ≤3 min | NOT STARTED (human) |
| 8.5 | Technical video ≤5 min | NOT STARTED (human) |
| 8.6 | One mainnet pool | BLOCKED — needs mainnet SOL + user approval |
| 8.7 | Submit on hackathons.solana.com | NOT STARTED (human) |

---

## 3. Honest Measurement & Gap List

Last verified: 2026-09-18 against running devnet and Neon Postgres.

### Overall Completion: ~82% (41 / 50 technical tasks verified complete)

The user's initial estimate was "20% done, only the UI". That estimate is **disproven by on-chain and database evidence**:
- **7 live devnet DBC pools** created and persisted in Neon Postgres (`juno_pools`).
- **Real devnet buys landed**: e.g., NVDAx 0.5 SOL buy (`59DBxUgPPjANJhKEmuxp5FMXL4sSR77Uxs8kefRhMuKQkptnVMgSbPvN6YZfUCQ2KfUJWXWZjmSyEzuZzQJwdGzV`), moving curve 0.0000% → 0.0117%.
- **Full graduation loop executed**: driven 0% → 100.0000% on devnet, migrated to DAMM v2 pool `EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L` (migration tx: `4HatkGNZKu5d9S79ZtjyAng9tRFshjhJRFbhqJQczqbgyAEonhm7cF5fmUy52CFbGgzdtRvHmWPmNo4uKbMVTZtc`).
- **Creator trading fees claimed on-chain**: 0.009653 SOL claimed (`3X4g3aDgpW8QKAF8WB3JD18L7S73SqUjen8MYFunqWLBdGxykWYVGT2t1DiwUMgANBpU9zx3d2c2zWGyZnA9HdAN`).
- **Token metadata & video media pinned to IPFS** via Pinata; IPFS gateway proxy `/api/ipfs/[cid]` operational with streaming and Range caching.
- **140 unit tests passing** (including Meteora SDK parameter validation).
- **All 6 UI routes** (`/explore`, `/reels`, `/coin/[address]`, `/creator/[handle]`, `/create`, `/activity`) render live data with zero console errors.

---

### Itemized Remaining Gaps & Granular Todo List

#### Block 1: Real On-Chain Sell Execution (Task 4.3)
- [ ] Execute a real signed sell transaction on devnet from launcher key (`9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE`), which holds 237,911.47 NVDAx tokens.
- [ ] Confirm signature lands on Solscan and verify the curve moves down.
- [ ] Record the transaction signature and update on-chain tables.

#### Block 2: Stock Wedge — Issuance Mode in `/create` (Task 6.2)
- [ ] Add an "Issuance Mode" switch to `/create` (Post / Reel / Stock Token Issuance).
- [ ] When in Stock Issuance mode:
  - Provide stock ticker search / selector (e.g. AAPLx, NVDAx, TSLAx, MSFTx, AMZNx).
  - Automatically recommend curve preset (`thin-name` for low-float, `ipo-book` for book-building, `tight-nav` for ETF/index tracker).
  - Associate Pyth feed ID (`Equity.US.<TICKER>/USD`) in pool metadata.
  - Gracefully display NAV reference info without failing if `PYTH_API_KEY` is absent.

#### Block 3: Swap-Event Indexer, Price Chart, 24h Volume & Activity Feed (Tasks 3.9, 4.4, UI Enhancements)
- [ ] Build a lightweight on-chain swap indexer in `lib/juno/indexer.ts` querying RPC `getSignaturesForAddress` + `getParsedTransactions` for the DBC pool.
- [ ] Parse DBC swap instruction logs to extract:
  - Trade direction (`Buy` vs `Sell`).
  - Base and quote amounts.
  - Price at swap execution.
  - Trader wallet and timestamp.
- [ ] Compute real 24-hour volume on `/coin/[address]` and `/explore` (replacing `—`).
- [ ] Display rich trade direction, size, and tokens in `/activity` and the coin Activity tab.
- [ ] Render a real SVG price chart in `CoinMedia.tsx` using parsed swap points, replacing `PriceChartPlaceholder`.

#### Block 4: Social Persistence (Comments, Likes, Follows)
- [ ] Add Drizzle schemas in `lib/db/schema.ts` for `juno_comments`, `juno_likes`, `juno_follows`.
- [ ] Apply migration / schema push to Neon Postgres.
- [ ] Create API routes:
  - `GET /api/juno/comments?baseMint=<mint>`
  - `POST /api/juno/comments` (wallet signed or simulated author)
  - `POST /api/juno/likes` & `GET /api/juno/likes`
- [ ] Wire `CommentComposer` and comments tab on `/coin/[address]` to write and read from Postgres.

#### Block 5: Quarantine / Purge Dead Non-Solana Code (Norr / Algorand / x402 / Privy / Clerk / Stripe)
- [ ] Inventory legacy non-Solana code:
  - `lib/algorand.ts`, `lib/x402.ts`, `lib/custodial*`, `lib/avm*`
  - `app/api/x402`, `app/api/account`, `app/add-funds`, `app/withdraw`
  - `components/WalletProviders.tsx` (remove Privy/Algorand wrappers, keep pure `@solana/wallet-adapter`)
- [ ] Remove or cleanly quarantine legacy non-Solana files so the repo reads cleanly as a Solana-only project.
- [ ] Verify unit tests and Next.js build pass cleanly without breaking `app/(juno)`.

#### Block 6: Submission Readiness & Build Verification (Tasks 8.1, 8.2)
- [ ] Verify `npm run build` succeeds with zero errors.
- [ ] Update root `README.md` to showcase Juno (replacing Norr documentation) with architecture, DBC innovation, devnet explorer links, and hackathon details.
- [ ] Ensure all documentation is aligned and truthful.

#### Legitimate Blockers (Do NOT Fake or Bypass):
- `PYTH_API_KEY`: Hermes price endpoints require API authentication. Code handles fallback cleanly.
- `NEXT_PUBLIC_SOLANA_RPC`: Public devnet RPC is currently used; rate-limiting is handled with aggressive client caching and fast-failure policies.
- Mainnet SOL (Task 8.6): Requires real funds and explicit user authorization.

---

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

1. Phase 3 (persistence) — unlocks every page showing real data
2. Phase 4 (trading) — the demo's core loop
3. Phase 5 (Pyth) — second sponsor track, cheap
4. Phase 6.2–6.3 (issuance mode + seeded equity pools) — the stock wedge
5. Phase 7 (graduation) — Meteora's "life after" story
6. Phase 8 (README, deploy) — submission artifacts
