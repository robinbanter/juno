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

## 3. Gap list

Every gap ties to the phase/task it blocks.

### Blocking gaps (product is mock without these)
| Gap | Location | Blocks |
|---|---|---|
| All 5 content pages read fixtures | `app/(juno)/{explore,reels,activity,creator,coin}` import `DEMO_*` | 3.6–3.10 |
| `lib/juno/mock.ts` is the data layer | whole file | 3.11 |
| Trade quotes are fake spot arithmetic | `app/(juno)/coin/[address]/TradePanelClient.tsx:46` | 4.1 |
| Swap submit is deliberately inert | `TradePanelClient.tsx:58` | 4.2, 4.3 |
| Balances hardcoded to 0 | `TradePanelClient.tsx` `balanceUsd={0} holding={0}` | 4.4 |
| Rail/nav link to demo creator | `SideRail.tsx:8`, `MobileNav.tsx:8` import `DEMO_CREATOR` | 3.8 |
| No launch persistence | table exists, nothing writes to it | 3.2–3.4 |

### Sponsor gaps
| Gap | Location | Blocks |
|---|---|---|
| `navBandBps` defined, never read | `lib/juno/curves.ts` | 5.2–5.4 |
| No Pyth integration at all | — | Phase 5 |
| No issuance mode | `/create` has no ticker concept | 6.2 |

### Submission gaps
| Gap | Location | Blocks |
|---|---|---|
| README is Norr's, zero Juno mentions | `README.md` | 8.1 |
| Not deployed | — | 8.2 |
| Public RPC only, rate-limited | `lib/juno/cluster.ts` fallback | 8.3 |
| No videos, not submitted | — | 8.4–8.7 |

### Cosmetic / lower priority
| Gap | Location | Blocks |
|---|---|---|
| Price chart is an honest empty state | `CoinMedia.tsx:103` | nothing critical |
| No media upload (Supabase creds exist) | `/create` file input inert | 6.2 nice-to-have |
| No comments/holders indexer | `CoinTabs` tabs read fixtures | 3.9 partial |

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
