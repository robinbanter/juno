# Juno — execution plan

**Status:** planning complete, build not started on mobile.
**Written:** 2026-09-21. **Deadline:** Fri 25 Sep 2026, 16:00 ET (STOCKLANA, Solana).
**Time remaining: ~4 days.**

This document is self-contained. A builder agent should be able to execute it
without the conversation that produced it.

---

## 1. Executive summary

Juno is a social app where **every post is a live market**. Publishing a post or
reel launches a [Meteora Dynamic Bonding Curve][dbc] pool for it on Solana;
people buy into the content as they scroll; the creator earns trading fees on
their own work instead of ad revenue. When a pool raises its
`migrationQuoteThreshold` it graduates into a **Meteora DAMM v2** pool and
becomes a normal AMM market that outlives the app.

The product is pivoting from a web-only surface to a **mobile-first Expo app
(`juno-expo`)** as the hero deliverable, with the existing Next.js app retained
and re-themed to serve the hackathon's required live demo URL.

**The honest position on scope:** the work below is more than four days holds.
Section 16 gives an explicit cut line. Read it before starting.

[dbc]: https://docs.meteora.ag/developer-guides/dbc

---

## 2. Vision, problem, target users

### Problem
A creator's audience cannot take a position in the creator's work. Attention
produces ad revenue for a platform, not equity for the person who earned it, and
a fan who spotted something early has no way to be right about it.

### Vision
Make the post itself the tradable instrument. Not a token *about* a creator — the
individual piece of content, with its own curve, its own price and its own
graduation into a permanent AMM market.

### Target users
| User | Wants | Gets |
|---|---|---|
| **Creator** | Income that is not ad rev-share | Trading fees on their own posts, claimable on-chain |
| **Fan / early spotter** | To back someone before everyone else | A curve where early entry is genuinely cheaper |
| **Trader** | Real markets with real liquidity | DBC pools that graduate into DAMM v2 and keep trading |
| **Hackathon judge** | Proof it is real, not slides | Explorer links to pools, swaps, fee claims, a migration |

### The strategic tension (do not lose this)
Juno is a **social content app**; STOCKLANA is about **tokenized stocks**. The
four curve presets are the bridge and they are the genuinely original work. The
demo must therefore lead with an **equity issuance**, not a coined photo.

---

## 3. Goals and definitions of done

### Product done
A person opens the app, scrolls a live feed of real trades and creator posts,
taps a coin, sees its real price and curve, buys it with a wallet they did not
have to install, and can post their own content which becomes a market.

### Technical done
- Every number on screen is read from chain or derived from it. No mock layer.
- Every write is a real signed Solana transaction.
- Typecheck clean, unit + integration suites green, production build green.

### Demo done
A ≤3 min pitch video filmed on the iOS Simulator showing: the feed → a coin →
**a real signed devnet buy** → the balance and curve moving → an explorer link.

### Hackathon done (STOCKLANA)
1. Public GitHub repo, README honest about on-chain vs not — **[DONE]** (`JUNO.md`)
2. Live demo URL with working wallet connect — **[NOT STARTED]**
3. Pitch video ≤3 min — **[NOT STARTED]**
4. Technical video ≤5 min (optional, worth doing) — **[NOT STARTED]**
5. ≥1 DBC pool created by the app, explorer links — **[DONE]** (4 pools)
6. Stock-shaped demo content — **[DONE]** (AAPLx, NVDAx, TSLAx, MSFTx)
7. Tracks: Meteora (mandatory) + Pyth — **[DONE]** both
8. Open-source dependency disclosure — **[DONE]**

---

## 4. Constraints and confirmed decisions

Decisions taken 2026-09-21. **Do not re-litigate these.**

| # | Decision | Chosen |
|---|---|---|
| D1 | Deliverable | **Mobile is the hero; web stays deployed as the required demo URL** |
| D2 | Theme | **Light sage + yellow, per reference image 1** |
| D3 | Wallet | **Privy embedded wallet** (`@privy-io/expo`, verified v0.74.2) |
| D4 | Assets | **Full asset pass up front**, one 3D character system, ~15–25 assets |
| D5 | Architecture | **API builds, phone signs** (agent's call, see §7) |
| D6 | Post button | **Launches a real coin on-chain** |
| D7 | Trade tab | **Market list → tap → buy/sell sheet with numpad** |
| D8 | Social feed | **Creator posts + real trades, mixed** (needs a new posts table) |
| D9 | Web theme | **Web is re-themed to light to match** |
| D10 | Repo layout | **`juno-expo/` alongside; no monorepo restructure** |
| D11 | Onboarding | **Browse free; Privy sign-in only on trade or post** |
| D12 | Network | **Devnet**, plus a mainnet-fork rehearsal. Real mainnet funded later by the user. |
| D13 | RPC | **Public endpoints** with caching, pacing and backoff in code |

### Hard constraints
- **iOS Simulator cannot sign with Phantom.** Mobile Wallet Adapter is
  Android-only and deeplinks need the real app installed. This is why D3 is
  Privy and not "connect Phantom" — it is not a preference, it is the only way a
  simulator demo signs a real transaction.
- **The public devnet RPC refuses batched `getParsedTransactions`** with
  "Too many requests for a specific RPC call". This is a per-method policy, not a
  burst to wait out. Small paced batches only. Already handled in `lib/juno/swaps.ts`.
- **Pyth's Hermes HTTP API returns 401** without a key. Prices are read from
  on-chain `PriceUpdateV2` accounts instead. Already handled in `lib/juno/pyth.ts`.

---

## 5. Final product specification

### Navigation — 5 slots, Post in the centre (reference image 4)

| Slot | Tab | Purpose |
|---|---|---|
| 1 | **Social** | Mixed feed: real trades + creator posts, across all coins |
| 2 | **Trade** | Market list of every Juno coin → tap → buy/sell sheet |
| 3 | **Post** (centre, raised) | Launch a real coin: media → preset → sign |
| 4 | **Reels** | Vertical swipe feed of `format = reel` coins, quick-buy |
| 5 | **Profile** | Portfolio, holdings, P&L, your launches |

### Screen inventory

| # | Screen | Reference | Key content |
|---|---|---|---|
| S1 | Onboarding | Image 1 | 3D character network, "Social Trading Community", Get Started |
| S2 | Social feed | Image 2 left | Trade cards + post cards, avatar, ticker, price move, Buy |
| S3 | Post composer | — | Media pick, title/ticker, curve preset, quote token, launch |
| S4 | Trade / market list | — | All coins: art, price, 24h change, curve progress |
| S5 | Coin detail | Image 2 left | Art, price, curve, NAV band, chart, activity, holders |
| S6 | Buy/sell sheet | Image 2 right | Big amount, quick-amount chips, **custom numpad**, Buy |
| S7 | Reels | — | Full-bleed video, side rail, quick-buy sheet |
| S8 | Profile / portfolio | Image 3 | 3D object, total value, % change, holdings, P&L |
| S9 | Sign-in sheet | — | Privy email OTP, only on trade/post |

### Data entities
`juno_pools` **[DONE]** · `juno_comments` **[DONE]** · **`juno_posts` [NOT STARTED]**
(creator posts for the Social feed) · on-chain: DBC pool, config, mint, vaults,
Pyth `PriceUpdateV2`.

---

## 6. Feature priority

### P0 — the submission dies without these
- Onboarding → Social feed renders with real data
- Trade tab → coin detail → **real signed devnet buy** from the phone
- Post → **real DBC pool launched** from the phone
- Light theme applied across the app
- Web app deployed at a public URL
- Pitch video

### P1 — important, strongly expected
- Reels with real video playback
- Profile portfolio with real holdings and P&L
- NAV band on equity coins (the Pyth track, already built on web)
- Generated 3D asset system
- Creator posts composer + feed integration
- Web re-themed to light

### P2 — enhancement
- Veo animations
- Sell side polish, price chart on mobile
- Holders list, comments on mobile
- Android verification

### Post-MVP — deliberately later
- Real mainnet pool (D12: user funds later)
- Likes / follows persistence
- Push notifications, search, creator profiles for other users

---

## 7. Architecture and end-to-end flows

### Why "API builds, phone signs"

The Meteora DBC SDK and `@solana/web3.js` in React Native need Buffer, crypto
and `structuredClone` polyfills, and the DBC client reads accounts through an
Anchor-derived IDL layer that is awkward under Metro. On a four-day budget that
is the single most likely thing to burn a day for no user-visible gain.

Instead: the Next.js app already contains a tested Solana domain layer — vault
swap decoding, on-chain Pyth, pool hydration, launch planning. Expose it over
HTTP and the mobile app becomes a thin, fast client that reuses all of it.

**The signing still happens on the phone.** The API returns *unsigned,
serialised* transactions; Privy signs them on-device; the signed transaction is
submitted. Nothing custodial, nothing faked — the private key never leaves the
device, and the resulting signature is verifiable on an explorer.

```
Expo app ──HTTP──> Next.js API ──RPC──> Solana devnet
   │                    │
   │                    ├── lib/juno/chain.ts     (hydratePool)
   │                    ├── lib/juno/swaps.ts     (vault-delta decoding)
   │                    ├── lib/juno/pyth.ts      (on-chain PriceUpdateV2)
   │                    └── lib/juno/dbc.ts       (planLaunch, buildSwapTransaction)
   │
   └── Privy embedded wallet: signs the bytes the API returned
```

### API surface

Existing — **[DONE]**: `POST/GET /api/juno/pools` · `GET/POST /api/juno/comments`
· `POST /api/juno/upload` · `GET /api/juno/metadata` · `GET /api/ipfs/[cid]`

To add — all **[NOT STARTED]**:

| Endpoint | Returns |
|---|---|
| `GET /api/juno/feed` | Mixed social feed: trades + posts, paginated |
| `GET /api/juno/coins` | Market list: hydrated coins, sortable |
| `GET /api/juno/coins/[mint]` | One hydrated coin + chart series + activity |
| `POST /api/juno/tx/swap` | Unsigned swap tx (base64) for a mint + amount + side |
| `POST /api/juno/tx/launch` | Unsigned config + pool txs for a launch |
| `POST /api/juno/tx/submit` | Submit a signed tx, confirm, invalidate caches |
| `GET /api/juno/portfolio/[wallet]` | Holdings, cost basis and P&L from decoded swaps |
| `GET/POST /api/juno/posts` | Creator posts |

### Critical flow — buy, end to end
1. Tap Buy on a coin → sheet opens, numpad entry
2. Not signed in → Privy email OTP sheet → embedded wallet provisioned
3. `POST /api/juno/tx/swap` → unsigned transaction + quote
4. Privy signs on device
5. `POST /api/juno/tx/submit` → confirmed signature
6. Caches invalidated; price, curve and balance re-read; receipt with explorer link

**Failure states that must be handled:** no funds (devnet SOL), quote moved
between quote and sign, RPC 429 mid-submit, user cancels signing, pool already
graduated (program rejects the swap).

### Critical flow — post/launch
Media → `POST /api/juno/upload` (IPFS, Pinata) → metadata pinned →
`POST /api/juno/tx/launch` returns **two** transactions (config ~1109B, pool
~673B — they cannot be bundled, see §15 R4) → Privy signs both in order →
submit → `POST /api/juno/pools` records the row → navigate to the coin.

---

## 8. Current codebase state

Verified 2026-09-21 by running the suites and reading live chain and DB state —
not by trusting the README.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run test:unit` | **19 files, 163 tests, all passing** |
| `juno_pools` rows | **15** (11 devnet, 4 mainnet-fork), read live from Neon |
| Devnet launcher `9CHr5g24…WYoE` | **5.5092 SOL** — enough to execute real on-chain work |
| Meteora lifecycle | launch → 8 buys → 100% curve → `migrateToDammV2` → DAMM v2 pool `EhvtVimk…MYy7L`, plus a real fee claim |

### Web app: what is genuinely built
DBC launch (2-tx split), real swaps both sides, partial-fill, creator fee
claiming, graduation to DAMM v2, the pool registry, IPFS media + pinned token
metadata, an IPFS gateway with failover, 4 curve presets with 16 liquidity
weights each validated against Meteora's own `validateConfigParameters`.

### Landed earlier today (commit `6a864c6`)
- **Swap decoding from pool vault deltas** — no indexer needed. Fixed a real
  defect: every Activity row was hardcoded `side: "buy"` with a zero amount, so
  sells rendered as buys. Now produces activity, 24h volume, total volume, the
  price chart and the 24h change.
- **Pyth read on-chain** — Hermes is 401-gated, but `PriceUpdateV2` accounts are
  readable with just an RPC connection. Shards are not equally fresh (crypto on
  0, equities on 1) so both are read and the newer wins; a weekend equity mark is
  Friday's close and is labelled as such, not as live.
- RPC resilience (paced small batches, backoff, partial-read honesty), media
  mime wiring, `Delta` accepting a null direction.

### Uncommitted work in the tree — **commit before starting mobile**
```
 M app/(juno)/activity/page.tsx          globalActivity, bounded concurrency
 M app/(juno)/coin/[address]/page.tsx    Suspense streaming
 M components/juno/coin/CoinMedia.tsx    chart slot
 M components/juno/coin/CoinSummary.tsx  NAV panel + currency-correct money()
 M components/juno/coin/CoinTabs.tsx     activity as a streamed node
 M components/juno/coin/TradePanel.tsx   NAV band breach warning
 M components/juno/reels/ReelCard.tsx    money()
 M lib/juno/chain.ts                     volume/change/nav/history wiring
 M lib/juno/format.ts                    money()
?? components/juno/coin/NavPanel.tsx     NAV band UI
?? components/juno/coin/PriceChart.tsx   real price chart
```
Measured after streaming: coin page **TTFB 0.19s** (was 6.7s blocking), explore
2.5s, reels 0.4s, activity 0.26s cached / ~16s cold.

### Mobile: nothing exists
No Expo, no React Native, no `app.json`, no workspaces. `juno-expo/` is greenfield.

---

## 9. Gap audit

| # | Gap | Evidence | Impact | Severity | Blocks |
|---|---|---|---|---|---|
| G1 | No mobile app at all | no Expo/RN anywhere in repo | The hero deliverable does not exist | **BLOCKER** | Phase 2–6 |
| G2 | Not deployed | no Vercel project | Fails submission requirement #2 | **BLOCKER** | Phase 8 |
| G3 | No videos, not submitted | — | Fails requirements #3, #7 | **BLOCKER** | Phase 9 |
| G4 | No mobile-facing API | `app/api/juno/` has 4 routes, none of them feed/market/tx | Mobile has nothing to call | **HIGH** | Phase 2 |
| G5 | `juno_posts` does not exist | absent from `lib/db/schema.ts` | D8's creator posts have no storage | **HIGH** | Phase 5 |
| G6 | No portfolio / P&L anywhere | no cost-basis code | Profile screen (S8) has no data | **HIGH** | Phase 6 |
| G7 | Light theme does not exist | `globals.css` is dark-only | D2 and D9 both unstarted | **HIGH** | Phase 1, 7 |
| G8 | No generated assets | `public/` holds old Unveil logos | D4 unstarted; onboarding has no art | **HIGH** | Phase 1 |
| G9 | Browser launch never verified with a real wallet | prior plan task 2.6 | Launch is CLI-verified only | MEDIUM | Phase 4 |
| G10 | Activity page ~16s cold | measured | Slow surface if reused by mobile | MEDIUM | Phase 2 |
| G11 | Uncommitted web work | `git status` above | Risk of loss | MEDIUM | Phase 0 |
| G12 | No mainnet-fork rehearsal | D12 | "Works on mainnet" unproven | LOW | Phase 9 |
| G13 | Web `/create` has no issuance mode | ticker → preset → NAV feed absent | Stock wedge weaker on web | LOW | P2 |

---

## 10. Implementation phases

Tags reflect repo evidence: `[DONE]` `[IN PROGRESS]` `[NOT STARTED]` `[BLOCKED]`

### Phase 0 — Secure current work (30 min)
**Exit:** tree clean, suites green, nothing at risk.
- 0.1 Commit the uncommitted chart/NAV/streaming work — **[DONE]** (`6f454c5`)
- 0.2 Run `tsc`, unit + integration suites; confirm green — **[DONE]**
- 0.3 Push branch `juno` to `origin` — **[DONE]**

### Phase 1 — Design system + assets (parallelisable, start immediately)
**Exit:** a token file and every asset the screens reference.
- 1.1 Define light theme tokens. **Validated values below — do not re-pick by eye.** — **[DONE]** (`juno-expo/theme/tokens.ts`)
- 1.2 Generate the 3D character system via ChatGPT in Chrome, one style prompt for consistency — **[IN PROGRESS]** — vector art shipped meanwhile (`components/art.tsx`)
- 1.3 Generate onboarding hero, portfolio 3D object, tab icons, empty states — **[IN PROGRESS]** — all drawn in code and shipping; generated versions to swap in
- 1.4 App icon + splash — **[NOT STARTED]**
- 1.5 Veo animations for onboarding — **[NOT STARTED]** *(P2 — cut first)*

**Validated light palette** (run through the dataviz six-check validator on a
white surface; all PASS):

| Token | Value | Notes |
|---|---|---|
| `bg` | `#D3E3CB` | sage canvas, from reference 1 |
| `surface` | `#FFFFFF` | cards |
| `ink` | `#1C1C1C` | primary text |
| `primary` | `#F2E230` | yellow action fill; use `ink` for its label |
| `pos` | `#0E9F6E` | buy / up |
| `neg` | `#D92D20` | sell / down |
| chart categorical | `#2E5BFF, #0E9F6E, #C77700, #8B5CF6` | amber snapped from `#F2A413`, which failed contrast on light |

> `#0E9F6E`↔`#D92D20` scores deutan ΔE 9.0 — above the safe floor, but direction
> must still carry a sign or arrow in text, never colour alone.

### Phase 2 — Mobile API layer (blocks all mobile data)
**Exit:** every endpoint in §7 returns real data, verified with `curl`.
- 2.1 `GET /api/juno/coins` + `GET /api/juno/coins/[mint]` — **[DONE]** verified 200 with live data
- 2.2 `GET /api/juno/feed` — mixed trades + posts — **[DONE]** verified 11 posts + trades
- 2.3 `POST /api/juno/tx/swap` — unsigned tx + quote — **[DONE]**
- 2.4 `POST /api/juno/tx/launch` — the two unsigned txs — **[DONE]** both under the packet limit
- 2.5 `POST /api/juno/tx/submit` — submit, confirm, invalidate caches — **[DONE]**
- 2.6 `GET /api/juno/portfolio/[wallet]` — holdings + cost basis — **[DONE]** 2 positions, $512.76
- 2.7 CORS for the Expo origin — **[DONE]**. Rate limiting — **[NOT STARTED]**
- 2.8 Fix G10: bound the activity feed cost — **[DONE]** ~17s -> 0.26s cached

> Acceptance for 2.3–2.5: a test signs the returned bytes with the devnet
> launcher key and lands a real swap. If that test cannot pass, the mobile buy
> flow cannot work, and everything downstream is theatre.

### Phase 3 — Expo skeleton
**Exit:** app boots in the iOS Simulator with all five tabs navigable.
- 3.1 `create-expo-app juno-expo` (expo-router), no repo restructure — **[DONE]**
- 3.2 Theme tokens + UI primitives — **[DONE]**
- 3.3 Bottom tab navigator, 5 slots, raised centre Post — **[DONE]** verified rendering
- 3.4 API client with typed responses, timeouts, host inference — **[DONE]**
- 3.5 Boot on the iOS Simulator — **[BLOCKED]** — `xcode-select` points at CommandLineTools. Xcode.app *is* installed; needs one sudo command (see §4 USER_ACTION). Verified on Expo web instead: all screens render, no console errors.

### Phase 4 — Wallet + the money path (**the highest-risk phase; start early**)
**Exit:** a real signed devnet buy from the simulator, verifiable on Solscan.
- 4.1 `@privy-io/expo` v0.74.2 — **[BLOCKED]** — needs a mobile client registered for bundle id `fun.juno.app` in the Privy dashboard. Spike done: `signTransaction` takes a web3.js `Transaction`, not raw bytes.
- 4.2 Wallet created on demand at trade/post, never before (D11) — **[DONE]**
- 4.3 Sign an API-built transaction and submit it — **[DONE]** (device keychain key)
- 4.4 **Land a real devnet buy from server-built bytes** — **[DONE]** — `4YM9pnRu…QLsq` confirmed on devnet via `tests/integration/juno-tx.test.ts`. From the *simulator* specifically: blocked with 3.5.
- 4.5 Failure states: graduated pool, zero amount, timeouts, unreachable API — **[DONE]**. No-funds copy — **[NOT STARTED]**

### Phase 5 — Core screens
**Exit:** S1–S7 render real data.
- 5.1 S1 onboarding — **[DONE]** (vector art; generated art pending 1.2)
- 5.2 S2 social feed, trades + posts mixed — **[DONE]** verified
- 5.3 `juno_posts` table + migration + seed — **[DONE]**. In-app text composer — **[NOT STARTED]**
- 5.4 S4 market list with sorts — **[DONE]** verified, 10 coins
- 5.5 S5 coin detail: price, curve, NAV band, activity — **[DONE]** verified
- 5.6 S6 buy/sell sheet with custom numpad — **[DONE]** (live quote, debounced)
- 5.7 S3 launch composer → real on-chain launch (D6) — **[DONE]** (two-step signing, resumable)
- 5.8 S7 reels, `expo-video`, IPFS playback — **[DONE]**

### Phase 6 — Portfolio
- 6.1 Cost basis + P&L, average-cost, 9 unit tests — **[DONE]**
- 6.2 S8 profile: 3D object, total value, % change, holdings — **[DONE]**

### Phase 7 — Re-theme web (D9)
- 7.1 Light tokens in `globals.css` — **[NOT STARTED]**
- 7.2 Re-validate chart, curve and buy/sell colours on light — **[NOT STARTED]**
- 7.3 Visual pass over all 5 web routes — **[NOT STARTED]**

### Phase 8 — Deploy (G2)
- 8.1 Deploy Next.js to Vercel, env vars set — **[NOT STARTED]**
- 8.2 Point the Expo app at the deployed API — **[NOT STARTED]**
- 8.3 Verify every route on the public URL — **[NOT STARTED]**

### Phase 9 — Submission (G3)
- 9.1 Mainnet-fork rehearsal: launch → trade → graduate (G12, D12) — **[NOT STARTED]**
- 9.2 Update `JUNO.md` for mobile + honest state — **[NOT STARTED]**
- 9.3 Pitch video ≤3 min, filmed on the simulator — **[BLOCKED — human]**
- 9.4 Technical video ≤5 min — **[BLOCKED — human]**
- 9.5 Submit on hackathons.solana.com — **[BLOCKED — human]**
- 9.6 Real mainnet pool — **[BLOCKED — user funds later, D12]**

---

## 11. Testing strategy

| Layer | Covers | State |
|---|---|---|
| Unit | Curve presets vs Meteora's validator, swap decode rules, volume/change maths, formatting, session, rate limits | **[DONE]** 163 passing |
| Integration | Live devnet reads, every Pyth feed id resolving to a real on-chain account | **[DONE]** |
| API | Each new endpoint returns real data; tx endpoints produce *signable* bytes | **[NOT STARTED]** |
| Mobile | Buy and launch flows driven on the simulator via the simulator tools | **[NOT STARTED]** |
| Manual | All 5 tabs, fresh install, signed-out, empty states, no funds | **[NOT STARTED]** |

**Non-negotiable test:** an integration test signs an API-built swap with the
devnet key and lands it on-chain. That single test is what separates a real
product from a demo that looks like one.

---

## 12. Deployment and operations

- **Web:** Vercel. Env: `DATABASE_URL`, `PINATA_JWT`, `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`,
  `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
  `SESSION_SECRET`. `NEXT_PUBLIC_SOLANA_RPC` intentionally unset (D13).
- **Mobile:** Expo Go / simulator build for the demo. No App Store submission.
- **DB:** Neon Postgres, already live. One new migration for `juno_posts`.
- **Caching:** in-process TTL caches (pool snapshot 5s, swap history 60s, Pyth
  60s, feed 60s). Per-instance by design; the worst case is two instances each
  doing one read.
- **Monitoring:** `lib/observability.ts` exists; route errors already logged.

---

## 13. Demo strategy

### Must work live (faking any of these voids the entry)
- A real signed devnet **buy** from the app
- A real **coin launch** from the Post button
- Real prices, curve progress and trade history from chain
- Explorer links that resolve

### Safe to simulate
- Seeded demo posts and comments (label them seeded)
- Generated avatars for wallets without profiles
- The mainnet story — devnet + fork rehearsal, stated plainly

### Must not be faked — it proves the core claim
Trading and launching. The whole thesis is "every post is a real market"; a
mocked buy makes the entire submission a lie. This is also why D3 is Privy —
see §4.

### Demo script (≤3 min)
1. Onboarding → Get Started (5s)
2. Social feed scrolling real trades (15s)
3. Tap an **equity issuance** — AAPLx — show the curve and the **Pyth NAV band** (30s)
4. Buy → numpad → sign → **confirmed, price and curve move** (45s)
5. Open the explorer link (10s)
6. Post → media → preset → launch a **real pool** (40s)
7. Profile: the position now shows in the portfolio (15s)

**Fallback:** if live RPC misbehaves on camera, have a pre-recorded capture of
step 4 ready. Do not fake it live — cut to the recording and say so.

---

## 14. Critical path and parallel work

### Critical path
`Phase 0 → 2.3/2.4/2.5 (tx endpoints) → Phase 3 → Phase 4 (signing) → 5.6/5.7 → 8 → 9.3`

Everything else can slip. The tx-building endpoints and Privy signing are the
only truly novel technical risk; **do them first, not last.**

### Parallelisable
- Phase 1 (assets/theme) runs alongside Phase 2 — different skills, no shared files
- Phase 7 (web re-theme) is independent of all mobile work
- Phase 6 (portfolio) only needs 2.6

### Final mile
Deploy → videos → submit. Reserve **all of the last day** for this. It always
takes longer than planned.

---

## 15. Risks and mitigations

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **Scope exceeds 4 days** | **High** | §16 cut line. Re-assess after Phase 4. |
| R2 | Privy Expo signing fights Solana tx format | Medium-High | Phase 4 early. Fallback: local demo keypair, labelled honestly. |
| R3 | Public RPC throttles during the demo | Medium | Caches + pacing already built; pre-warm every screen before filming |
| R4 | Launch needs two signatures, user drops between them | Medium | `createConfigAndPool` cannot carry a 16-segment curve — it serialises to ~1488B against Solana's 1232B limit. The two-tx split is forced. Make the second signature resumable. |
| R5 | Asset generation eats a day | Medium | Cut 1.5 (Veo) first; generate in one batch, not iteratively |
| R6 | Web re-theme (D9) breaks validated colours | Medium | Re-run the palette validator; do not eyeball |
| R7 | Empty social feed on a fresh demo | Medium | Seed posts as part of 5.3, not as an afterthought |
| R8 | Expo + Next.js in one repo confuses Vercel | Low | D10 keeps Next.js at root; add `juno-expo/` to `.vercelignore` |

---

## 16. Execution order — and the cut line

### Order
1. **Phase 0** — commit and push (30 min)
2. **Phase 1.1** — theme tokens (30 min) *then hand assets off to run in parallel*
3. **Phase 2.3–2.5** — tx endpoints + the signing test **← the real risk**
4. **Phase 3** — Expo skeleton + tabs
5. **Phase 4** — Privy signing, land a real buy
6. **Phase 2.1–2.2, 2.6** — read endpoints
7. **Phase 5** — screens, in order 5.6 → 5.5 → 5.4 → 5.2 → 5.1 → 5.7 → 5.8
8. **Phase 6** — portfolio
9. **Phase 8** — deploy
10. **Phase 7** — web re-theme *(only if Phase 8 is done)*
11. **Phase 9** — videos, submit

### The cut line — read this before starting

Four days does not hold all of the above. In priority order, **cut from the
bottom**:

1. ~~1.5 Veo animations~~ — pure polish
2. ~~Phase 7 web re-theme (D9)~~ — the web app already works; a light coat of
   paint on a surface judges may never open is the cheapest thing to lose
3. ~~5.8 Reels~~ — the least differentiated screen
4. ~~6.x Portfolio~~ — beautiful, but it does not prove the thesis
5. ~~5.3 Creator posts (D8)~~ — the feed still works with trades alone

**Never cut:** the real buy (4.4), the real launch (5.7), the deploy (8), or the
pitch video (9.3). Those four are the submission.

If Phase 4 is not working by end of day 2, invoke R2's fallback immediately
rather than debugging Privy into day 3.

---

## 17. Remaining unknowns

| Unknown | Resolve by |
|---|---|
| Does Privy's Expo SDK sign raw Solana transaction bytes cleanly, or only through its own helpers? | Phase 4.1 — spike it first, before any screen work |
| Vercel account/team for the deploy | Ask the user at Phase 8 |
| Whether ChatGPT image generation produces a consistent enough character set from one prompt | Phase 1.2 — generate 3, judge consistency, then commit to the style |
| Exact sage/yellow hex from reference 1 | Tokens in 1.1 are derived by eye from the reference and validated; confirm with the user on first render |
| Whether the STOCKLANA form accepts a simulator-recorded video as the demo | Check the submission form early, not on day 4 |

### USER_ACTION_REQUIRED
- **9.3 / 9.4** — record the pitch and technical videos
- **9.5** — submit on hackathons.solana.com
- **9.6** — fund a mainnet key if you want a real mainnet pool (D12)
- **8.1** — Vercel account access
- **1.2** — a logged-in ChatGPT session in Chrome for asset generation
