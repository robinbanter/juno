# Juno — test plan on the local mainnet fork

Written before execution. Every item states the exact expected result; a PASS
requires the observed result to match it **and** a clean console (no
`error`-level messages, no uncaught exceptions) **and** no failed network
request (status ≥ 400 or network failure) other than those the item itself
provokes on purpose. Anything visible that is wrong is a FAIL.

Status legend: `PASS` · `FAIL` (with the fix) · `UNTESTED` (with the missing
dependency — never counted as a pass).

## Environment

| | |
|---|---|
| Cluster | `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-fork` |
| RPC | `solana-test-validator` on `http://127.0.0.1:8930` (ws `:8931`), `--reset`, the 25 clones from `npm run juno:fork` (DBC, DAMM v2, Metaplex programs; DBC + DAMM v2 authority PDAs; DAMM v2 configs; Circle USDC; Pyth feeds) |
| USDC | A 10,000 USDC SPL token account for each test wallet, injected at validator start with `--account` (real token state on the fork: only Circle can mint USDC, so this is how a fork gets a balance) |
| SOL | 100 SOL airdropped by the fork faucet to each wallet |
| Wallet A (creator/trader) | `35epkE8CQYszpQw68ifmFbY6H1NXFd1DCUz2pkqLux55` — Wallet Standard wallet injected into real Google Chrome, backed by a real keypair; signs real fork transactions and real messages |
| Wallet B (deployer) | `9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE` — second identity for cross-wallet checks |
| Database | Neon Postgres (`juno_pools`, `juno_pool_txs`), rows scoped `cluster = mainnet-fork` |
| Social | MongoDB Atlas (`comments`, `likes`, `follows`) |
| IPFS | Pinata, real JWT |
| Browser | Google Chrome driven by Playwright (`channel: chrome`), console + network captured per item. `ao browser` is not usable here: it stays on the root loading fallback and its RSC fetches fail with `net::ERR_FAILED`. |
| Pyth | Read on-chain from the cloned accounts. Clones are frozen at fork start: SOL/USD is live for `MAX_PRICE_AGE_SECONDS` (600 s) after start, then stale. US equity feeds publish only during market hours. |

Fixtures created by the plan itself (section D) and reused later:
`F-POST` (content post, SOL, image), `F-REEL` (reel, SOL, video),
`F-STOCK` (STOCKLANA AAPLx issuance, USDC, ipo-book, Pyth `Equity.US.AAPL/USD`),
`F-GRAD` (content, SOL, tiny curve, driven to graduation).

---

## A. Infrastructure and integrations

| # | Item | Expected result | Status |
|---|---|---|---|
| A1 | Fork validator | `getSlot` on :8930 advances; `getAccountInfo` of DBC `dbcij3LW…MaqN` is an executable upgradeable program | |
| A2 | Clones complete | Every one of the 25 `juno:fork` addresses exists on the fork | |
| A3 | Wallet funding | Wallet A: 100 SOL, 10,000 USDC on the fork | |
| A4 | `GET /api/health` | 200, `status: ok`, `cluster: mainnet-fork`, `database.ok`, `rpc.ok` with the fork slot, `dedicatedRpc.ok` | |
| A5 | Health when RPC down | Validator stopped → `/api/health` answers (not a hang/500) with `rpc.ok: false` and `status` not `ok`; restart restores `ok` | |
| A6 | Neon Postgres | Registry write from a launch is readable back via `GET /api/juno/pools` and directly in `juno_pools` with `cluster = mainnet-fork` | |
| A7 | Cluster scoping | No devnet row (11 exist) appears on any fork page or in `GET /api/juno/pools` | |
| A8 | Pinata auth | `POST /api/juno/upload` of a real PNG returns 201 with `cid`, `url`; the URL serves the same bytes | |
| A9 | `GET /api/ipfs/[cid]` | Valid CID of pinned file → 200 with the file's content-type; malformed CID → 400 | |
| A10 | MongoDB | Comment/like/follow round-trip reads back what was written (covered in section H) | |
| A11 | Production build | `npm run build` exits 0; `next start` serves the fork app with the production CSP header | |
| A12 | Unit suite + typecheck | `vitest run` all pass; `tsc --noEmit` clean | |

## B. Global shell (every page)

| # | Item | Expected result | Status |
|---|---|---|---|
| B1 | Brand + nav | Juno mark links to `/explore`; side rail Home/Reels/Trending/Create/Activity each navigate to their route with the active item marked | |
| B2 | `/` | Redirects to `/explore` | |
| B3 | Header search | Typing "AAPL" + Enter navigates to `/explore?q=AAPL` | |
| B4 | Connect button (disconnected) | Reads "Connect"; click opens the wallet modal listing the installed wallet | |
| B5 | Connect | Choosing Wallet A shows `35ep…ux55` in the header, no errors | |
| B6 | Disconnect | Header menu → Disconnect returns the button to "Connect" | |
| B7 | Wallet rejects connection | Wallet throws on `connect` → header stays "Connect", no uncaught error | |
| B8 | Mobile layout (402 px) | Bottom nav visible, side rail hidden, no horizontal scroll | |
| B9 | Get-the-App card | Present on explore; dismiss removes it; absent on `/coin/*` and `/reels` | |
| B10 | 404 | `/nope` renders the not-found page with HTTP 404 | |
| B11 | No dead controls | Every button in `components/juno` and `app/(juno)` has an action (static sweep: no `<button>`/`Button`/`IconButton` without `onClick`/submit), and each exercised one does what its label says | |

## C. `/create` — form behaviour

| # | Item | Expected result | Status |
|---|---|---|---|
| C1 | Disconnected CTA | Submit reads "Connect wallet to launch" | |
| C2 | Format toggle | Post ↔ Reel; Reel label changes the upload prompt to "Upload a vertical video" | |
| C3 | Curve picker | Four presets (Content, Thin name, IPO book, Tight NAV) with fee ranges; selecting one updates the curve preview and rationale | |
| C4 | Ticker sanitising | Typing `ab-c1` yields `ABC1` | |
| C5 | Valuation guard | "Graduates at" ≤ "Opening valuation" disables submit | |
| C6 | Missing name/ticker | Submit disabled, reads "Add a name and ticker" | |
| C7 | Stock mode | "Stock Issuance" shows the four equity templates; choosing AAPLx fills name, ticker, IPO-book preset, USDC, and Pyth feed `Equity.US.AAPL/USD`; summary shows Mode "Stock Issuance (STOCKLANA)" and the feed | |
| C8 | Upload rejection | Choosing a `.txt` file is refused with a stated reason; nothing is pinned | |
| C9 | Upload in progress | While pinning, submit is disabled and reads "Uploading media…" | |
| C10 | Image upload | A PNG uploads, previews, shows "Pinned to IPFS · Qm…" | |
| C11 | Remove media | The remove button clears the preview | |
| C12 | Video upload | An MP4 uploads; a poster frame is pinned too (two upload requests, both 201) | |
| C13 | Valuation units follow the quote | USDC: inputs prefixed "$", summary "$1k → $25k". Switching to SOL resets to 10 → 250 and shows "SOL" on the inputs, the curve caption and the summary — never "$" for a SOL amount | |

## D. On-chain — launch (fixtures)

| # | Item | Expected result | Status |
|---|---|---|---|
| D1 | Launch `F-POST` (content, SOL, image) from the browser | Two wallet signatures (config, pool); receipt shows Transaction / Pool / Token mint / Config key, each linking to Solana Explorer with `cluster=custom` and the fork RPC; both txs confirmed on the fork | |
| D2 | `F-POST` registry | `juno_pools` row: creator = Wallet A, `cluster = mainnet-fork`, `media_mime = image/png`, poster = media | |
| D3 | `F-POST` token metadata | Mint's Metaplex account URI resolves to JSON with `image` = the pinned PNG | |
| D4 | Launch `F-REEL` (reel, SOL, MP4) | Confirmed; registry `media_mime = video/mp4`, `poster_url` ≠ `media_url`; metadata `image` = poster, `animation_url` = MP4 | |
| D5 | Launch `F-STOCK` (STOCKLANA AAPLx, USDC, ipo-book) | Confirmed against **mainnet Circle USDC** on the fork; registry `nav_feed_id = Equity.US.AAPL/USD`, `curve_preset = ipo-book` | |
| D6 | Launch `F-GRAD` (content, SOL, tiny curve) | Confirmed with a low graduation valuation so the curve can be filled | |
| D7 | Wallet rejects a launch signature | Error shown under the button ("cancelled"/rejected wording), form stays filled, nothing recorded in `juno_pools` | |
| D8 | Refresh mid-launch | Reload after the config tx: no partial registry row; a fresh launch succeeds | |
| D9 | Launch while RPC down | Validator stopped → launch shows an RPC error, no row written; restart and relaunch succeeds | |

## E. `/explore`

| # | Item | Expected result | Status |
|---|---|---|---|
| E1 | Empty state (before D) | "No coins yet on mainnet-fork" (or equivalent) + Launch CTA | |
| E2 | Latest | All fork fixtures, newest first, each with market cap read from the fork | |
| E3 | Tile media | Image tiles show the image; reel tile shows its poster (not a broken image) and a Reel badge | |
| E4 | Preset badge | Each tile shows its curve preset | |
| E5 | Trending | `?sort=trending` orders by 24h volume, unknown volume last | |
| E6 | Graduating | `?sort=graduating` orders by curve progress, graduated last | |
| E7 | Search hit / miss | `?q=aapl` → exactly AAPLx; `?q=zzzz` → "Nothing matches" message | |
| E8 | Tile → coin | Clicking a tile opens `/coin/<mint>` | |
| E9 | RPC down | Validator stopped → page renders with an honest unavailable notice, never "No coins yet" | |

## F. `/coin/[address]`

| # | Item | Expected result | Status |
|---|---|---|---|
| F1 | Header + summary | Creator short address links to `/creator/<wallet>`; name, ticker, description as launched | |
| F2 | Stats | Market cap from chain in the quote's unit or USD (USD only when a live rate exists); 24h volume; creator rewards | |
| F3 | Curve progress | Raised/threshold match a direct SDK read of the pool | |
| F4 | Curve chart | 16 segments render for the preset | |
| F5 | Media | Image coin shows the image; reel coin plays the `<video>` with the poster; no broken media | |
| F6 | Explorer links | Pool / Mint / Config / Launch tx → Solana Explorer custom-cluster links for the right addresses | |
| F7 | Tabs | Activity / Holders / Comments / Details switch; arrow keys move between them | |
| F8 | Holders | Lists real owners with balances; count in the header matches | |
| F9 | Details | Preset, addresses, threshold, progress match chain | |
| F10 | Unknown mint | Well-formed unregistered mint → not-found page | |
| F11 | Malformed mint | `/coin/abc` → 404 | |
| F12 | NAV panel on `F-STOCK` | Feed `Equity.US.AAPL/USD`; with the market closed the panel says **Stale** with the last publish time and prints no price; during market hours it prints the price, confidence and band position | |
| F13 | No NAV panel on non-stock coins | `F-POST` shows no NAV panel | |
| F14 | Graduated coin | `F-GRAD` after D-graduation shows the graduated notice and a DAMM v2 link instead of the trade panel | |
| F15 | RPC down | Validator stopped → "this coin exists, but its live data could not be read" view, no crash | |
| F16 | Share | "Share" copies the page URL (desktop: clipboard, label becomes "Link copied"); no other inert icon buttons in the coin header | |

## G. Trading (`/coin` trade panel)

| # | Item | Expected result | Status |
|---|---|---|---|
| G1 | Disconnected | Button reads "Buy"; no balance shown as insufficient | |
| G2 | Balance (SOL pool) | Wallet A connected → "Balance" shows native SOL less the fee reserve (≈ 99.99) | |
| G3 | Balance (USDC pool) | On `F-STOCK` → 10,000 USDC | |
| G4 | Quote | Typing 1 SOL yields a non-zero "You receive" from the DBC quoter | |
| G5 | Over-balance | Amount > balance → "Insufficient balance", disabled | |
| G6 | Over-curve | Buy more than the curve holds → quote error shown ("Insufficient Liquidity"), no uncaught error, no submit | |
| G7 | Buy SOL pool | Buy 1 SOL on `F-POST` → one signature, "Trade confirmed" + explorer link; balance and curve update | |
| G8 | Sell | Sell part of the holding → confirmed; holding decreases | |
| G9 | Sell presets | 25/50/75/Max set the amount from the real holding | |
| G10 | Buy USDC pool | Buy 100 USDC of `F-STOCK` → confirmed against mainnet USDC | |
| G11 | NAV check in trade panel | On `F-STOCK` with a stale feed the panel shows no "vs Pyth NAV" number; with a live feed it shows deviation vs the band | |
| G12 | Trade with comment | Comment typed + buy → comment appears under Comments tagged with the side and signature | |
| G13 | Wallet rejects trade | Error shown, no tx, balance unchanged | |
| G14 | Activity after trades | Activity tab lists each trade with side, size, value, trader, newest first | |
| G15 | Price chart | Chart tab plots the trades | |

## H. Social

| # | Item | Expected result | Status |
|---|---|---|---|
| H1 | Like (disconnected) | Button disabled, titled "Connect a wallet to like"; count visible | |
| H2 | Like (first time) | Wallet asked to sign the sign-in message once; count +1, pressed | |
| H3 | Unlike | Count −1, not pressed; no second signature | |
| H4 | Comment | Posting shows the comment immediately and after reload | |
| H5 | Comment validation | Empty → nothing sent; the box stops at 280 characters with a live counter reaching 0; the API refuses a 281-character body with 400 stating the 280 limit | |
| H6 | Follow / unfollow | On `/creator/<Wallet B>`: Follow → Following, followers +1; again → back | |
| H7 | Self-follow | On own profile: "Your profile", no follow action | |
| H8 | Sign-in rejected | Wallet refuses `signMessage` → message "Sign-in was cancelled in the wallet", nothing written | |
| H9 | API: no session | `POST /api/juno/likes` without cookie → 401 | |
| H10 | API: other wallet | With A's session, like as B → 403 | |
| H11 | API: forged/stale/wrong-domain sign-in | Each → 401 with its reason | |
| H12 | Session persistence | After reload, liking again needs no new signature | |

## I. `/reels`

| # | Item | Expected result | Status |
|---|---|---|---|
| I1 | Empty state (before D4) | "No reels yet" + Create CTA | |
| I2 | Feed | `F-REEL` card plays the video, shows name, creator, curve progress | |
| I3 | Quick buy | "Buy" opens the quick-buy sheet with presets in the pool's quote token (SOL for a SOL reel) and a live quote; buying signs once, confirms on the fork ("Bought · View tx"), and the coin balance rises | |
| I4 | Like from reel | Works as H2/H3 | |

## J. `/creator/[handle]`

| # | Item | Expected result | Status |
|---|---|---|---|
| J1 | Profile | `/creator/<Wallet A>` shows A's fork coins, aggregate MC, post count from the registry | |
| J2 | Tabs | Posts / Reels populated from fixtures; empty tabs say so | |
| J3 | Invalid handle | `/creator/notawallet` → 404 | |
| J4 | Unknown wallet | Valid wallet with no coins → empty profile, no errors | |
| J5 | Profile actions | "Buy latest" opens the creator's newest coin; hidden for a wallet with no coins; no Notify/More/Message/name-dropdown controls without an action | |

## K. `/activity`

| # | Item | Expected result | Status |
|---|---|---|---|
| K1 | Empty (before trades) | "Nothing has traded yet." | |
| K2 | Feed | Every fork trade from G/I across pools, newest first, with coin names and sides | |
| K3 | Persistence | Trades appear in `juno_pool_txs` for the fork pools | |

## L. Issuer tooling (`/coin/[address]/manage`)

| # | Item | Expected result | Status |
|---|---|---|---|
| L1 | Manage page | For `F-POST`: live reserve, threshold, price, fee schedule and preset weights read from the fork | |
| L2 | Not creator | Wallet B connected → claim/migrate actions unavailable | |
| L3 | Claim fees | Wallet A → "Claim fees" signs, confirms; claimable drops to 0; creator's quote balance rises by the claimed amount | |
| L4 | Migrate not ready | Before the curve is full, "Migrate to DAMM v2" is unavailable | |
| L5 | Fill `F-GRAD` | Buys bring progress to 100% | |
| L6 | Migrate | "Migrate to DAMM v2" signs, confirms; status "Migrated to DAMM v2"; the DAMM v2 pool account exists on the fork | |
| L7 | Unknown pool | `/coin/<unregistered>/manage` → not-found | |

## M. API routes (direct)

| # | Item | Expected result | Status |
|---|---|---|---|
| M1 | `GET /api/juno/pools` | 200, array of fork rows only | |
| M2 | `POST /api/juno/pools` non-JSON | 400 | |
| M3 | bad address | 400 `… is not an address` | |
| M4 | unknown pool | 404 `No such pool on this cluster` | |
| M5 | creator mismatch | 400 `creatorWallet does not match the pool` | |
| M6 | bad preset | 400 `Unknown curve preset` | |
| M7 | valid re-record | 201, idempotent (same row) | |
| M8 | `POST /api/juno/metadata` | 201 with `cid/uri/url`; no name → 400 | |
| M9 | `POST /api/juno/upload` | no file 400, wrong type 415, > 25 MB 413 | |
| M10 | `GET /api/juno/swaps` | valid → 200 with swaps/volume/points; bad params → 400 | |
| M11 | `GET /api/juno/comments` | valid coin → 200 list; bad coin → 400 | |
| M12 | `GET /api/juno/likes` / `follows` | counts; bad address → 400 | |
| M13 | `/api/juno/session` | GET → wallet/null; DELETE clears it | |
| M14 | Rate limit | 11th `POST /api/juno/pools` inside a minute (production limits) → 429 with `Retry-After` | |

## N. Resilience

| # | Item | Expected result | Status |
|---|---|---|---|
| N1 | Refresh mid-trade | Reloading after signing a trade: the trade either landed (visible in Activity) or did not; no stuck state | |
| N2 | Refresh mid-comment | No duplicate comment | |
| N3 | MongoDB unreachable | Coin page still renders (counts 0 / comments empty), no crash — verified by pointing `MONGODB_URI` at an unreachable host on a second server | |
| N4 | Database unreachable | `/api/health` reports `database.ok: false`; pages show the error boundary, not a blank screen | |
