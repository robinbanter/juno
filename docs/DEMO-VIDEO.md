# Juno demo video: shot-by-shot

**Length: 2:30.** Judges watch many of these, so the first ten seconds carry
the pitch. Every shot below is something that works on the live app today.

---

## Before you press record (10 minutes)

1. **Where to record.** A phone is best: https://juno-app-chi.vercel.app in
   Safari or Chrome, or the Android APK. Use the phone's built-in screen
   recorder. On a laptop, open the app in Chrome at phone width (DevTools →
   device toolbar → iPhone 14 Pro) and record with QuickTime (File → New
   Screen Recording) or OBS.
2. **Wallet ready.** Profile → *Get devnet SOL* until you have about 0.4 SOL.
   Tap **Choose a name** and claim one. It shows on every trade you make on
   camera.
3. **A photo to post.** Something you'd actually post, not a stock image.
   Keep it on the phone so the picker finds it straight away.
4. **Open these in tabs** so you never wait on camera:
   - the Deep Zoom reel's coin: `/coin/3znz9AnsaaGYz9BKEUbDMAmjycFsxs7g6EkNX77bTh2F`
   - the OpenAI tracker: `/coin/4BvmeTbEXzYJvhYQmiYNjG9DGVVFjfgpeCnXH57yKLea`
   - Solscan, the graduation transaction:
     https://solscan.io/tx/NsfDn9ufwHgga6XiNy1tkGW2HG2ooEeTnVSt6tC2aWhYGQRKxchhWa9jzW6T7DSHQJ6tsK74f4Bkk9zhPYnR8jR?cluster=devnet
5. **Do a dry run** of the whole flow once. The first load of each screen warms
   the server's caches, so the take is snappier.
6. Do Not Disturb on. Battery and clock visible is fine.

If a buy ever says the RPC is busy, wait two seconds and tap again. Cut that
out in editing.

---

## The shots

### 0:00–0:10 · Hook (Social tab)
Scroll the feed slowly. Stop on a post.

> "This is Juno. Every post is a market. When you post a photo or a reel, it
> launches its own Meteora bonding curve on Solana, and the people who find it
> early can buy in."

### 0:10–0:30 · Buy from the feed
Tap **Buy** on a post. Tap **$2**. Let the quote settle and point at the rows.

> "The quote comes from the live curve, not spot times size. Here's the fee,
> the price impact, and the most I can buy before the curve moves one
> percent."

Tap **Buy**. Hold on **Done: confirmed on Solana**. Tap *View the transaction*
for one second, then go back.

### 0:30–0:50 · Reels
Tap the Reels tab. Swipe once. Tap to unmute, double-tap to like.

> "Reels work the same way: full-screen video, with the market right under
> the caption. Market cap, progress to graduation, buy and sell."

Tap **Buy** in the dock and show the sheet opening. You don't need to buy again.

### 0:50–1:15 · Post one live
Tap **+** → *Post a photo*. Pick your photo, type a name and ticker, and scroll
the four curve shapes.

> "Posting is launching. I choose how the market behaves. *Content* is cheap
> early, *Thin name* is deep at the open, *IPO book* is deep at both ends, and
> *Tight NAV* stays flat so it can track a price."

Tap **Launch post**. Stay on it through both signatures and land on the new coin.

> "Two signatures, and that's a new Meteora pool. From a phone."

### 1:15–1:40 · Pre-IPO (the Tessera story)
Trade tab → **Pre-IPO**. Pause on OpenAI.

> "The same curves can issue something bigger. OpenAI, Kalshi and SpaceX
> haven't listed, but Tessera publishes marks for them. Each has a Juno curve
> priced against that mark, and the app shows how far the curve sits from it
> and whether it's inside its band."

Open the OpenAI coin. Details → the reference card.

> "And an honest detail: Tessera's tokens charge a transfer fee, and
> Meteora's program refuses a quote token with one. So the curve tracks the
> mark instead of pairing with it, and the app says why."

### 1:40–1:55 · Stocks (the Pyth story)
Trade → **Stocks**. Point at TSLA's red deviation. Open it, tap **Buy**, and
show the red warning line.

> "Listed names are marked against Pyth, read on-chain. When a curve drifts
> outside its band, you're told before you sign."

### 1:55–2:15 · Depth and exact-out (the Meteora story)
Open the Deep Zoom coin → **Details**. Show the depth chart.

> "This is what a buy of every size does to the price: twelve live quotes
> from the curve."

Tap **Buy**, then tap the token chip so it switches to **ZOOM ⇅**. Tap
**1.00M**.

> "And I can buy an exact number of tokens. The curve names the price, capped
> by a maximum."

### 2:15–2:30 · Proof and close
Switch to the Solscan tab showing `MigrationDammV2`.

> "Curves that fill graduate into Meteora DAMM v2. Here's one we completed and
> migrated on devnet, with the creator fees claimed. Juno: every post is a
> market."

End on the Juno feed or the logo.

---

## Recorded footage

Recorded 25 Sep on the iOS simulator (iPhone 17 Pro, 9:41 status bar) from a
fresh install, against the live API. Local, not committed, in `.juno/video/`:

| Clip | What happens | Tight length |
|---|---|---|
| `01-wallet` | Home screen → Juno opens → onboarding → *Create wallet* → faucet 0.2 SOL → claim `@stocklana` | 16s |
| `02-feed-buy` | Feed of real reels → "City After Rain $NEON, bought by demo_kai and 1 other" → like → Buy $2 → *Done, confirmed on Solana* | 13s |
| `03-reels` | Night city → skateboarder → surfer (like, Buy dock) → beach at dusk | 27s |
| `04-post-launch` | + → *Post a photo* → waterfall → "The Falls" / FALLS → curve shapes → Launch → first buy (8% impact = the anti-sniper opening fee) | 30s |
| `04b-falls-chart` | Memes → The Falls by stocklana, chart rising after the buy | 6s |
| `05-preipo` | Feed with The Falls on top → Pre-IPO → OpenAI "outside ±2% band" warning → Tessera reference card → depth chart | 20s |
| `06-stocks` | Stocks with real logos, live Pyth prices → TSLA "3.0% below, outside its band" | 10s |
| `07-depth-exactout` | Park Session ($KICK): chart, activity by named wallets → depth chart → token chip → exactly 1,000,000 KICK → Done | 25s |
| `08-mainnet-proof` | JUNOC on Jupiter (mainnet): chart, sniper buys and sells, our buy marked as the developer's → Solscan | 11s |

Each clip exists four ways:

- `raw/NN-*.mp4`: the untouched simulator recording, 1206×2622.
- `raw/NN-*.framed.mov`: inside the iPhone body, **ProRes 4444 with
  alpha**, for placing over any background in HyperFrames.
- `raw/NN-*.preview.mp4`: the framed phone on the Juno green, 1080×1920.
- `tight/NN-*.mp4`: the preview with every pause over 1.5s cut.

`juno-demo-roughcut.mp4` is the tight clips in order (2:27). The four reels are free-licence Pexels clips (IDs 18138660, 4759044, 8713108, 20151149) launched as real pools; the fractal test reels were unlisted and takes 02, 03 and 07 re-recorded. Take 01 skips the feed and 04, 04b and 05 start later, so no test content appears. Superseded takes are in `raw/old/`. To rebuild any of
it: `scripts/demo/frame-video.sh`, then `scripts/demo/tighten.py`.

### Full-length flow (second session, 25 Sep evening)

`juno-demo-full.mp4` (5:25) is the long version to cut from, in story order,
with pauses held to 2.5s rather than cut to the bone. `full/` has each part:

| Part | What happens |
|---|---|
| `01-wallet` | Fresh install → Create wallet → faucet → `@stocklana` |
| `02-feed-buy` | Feed of real reels → like → buy $2 of City After Rain |
| `03-reels` | Night city → skateboarder → surfer → beach |
| `04-comments` | City After Rain: 4 likes, 2 comments from other wallets → open → post "What a shot. Just bought in." → count goes to 3 |
| `05-post-launch-log` | Post a photo (Wild Bloom): **launch log fills in live — IPFS pins, config tx, pool tx, each with the second it landed** → coin page → first buy, receipt with tx hash and time |
| `06-reel-launch-log` | Same for a reel (Midnight Avenue) |
| `07-preipo-openai` | Pre-IPO with the OpenAI, Kalshi and SpaceX logos → buy $OPENAIX → band warning → receipt with tx and time → Tessera reference card → depth chart |
| `08-stocks` | Stocks with company logos and live Pyth prices → TSLA band warning |
| `09-depth-exactout` | Park Session: depth chart → buy exactly 1,000,000 KICK |
| `10-mainnet-proof` | JUNOC on Jupiter (mainnet) → Solscan |

Added in the third session (inserted in order, nothing re-recorded):

| Part | What happens | Sponsor |
|---|---|---|
| `06b-creator-claim` | Wild Bloom, as its creator: "Claim $0.0619 in creator fees" → signed on the phone → "Claimed 0.0005 SOL · tx 4XRaE9RY… · 9:31:44 PM", rewards drop to $0 | Meteora DBC |
| `08b-pyth-reference` | Stocks (prices have moved since the earlier take) → Tesla → TSLA reference card: Live, $370.88, "Read from Pyth on-chain" | Pyth |
| `09b-graduated-damm-v2` | Memes → two coins marked Graduated / On DAMM v2 → one opened: its fill history up to migration | Meteora DBC → DAMM v2 |
| `10b-mainnet-tslax` | Solana Explorer, Mainnet: the TSLAx-quoted pool (owned by the DBC program) → its config's decoded data, Quote Mint XsDoV…JHzoB → that mint is Tesla xStock | Meteora, stock-paired pool |

The full flow is now 6:47. The status bar now shows the real time of day, so it agrees with the receipts.
Framed versions of the new takes are in `raw2/`.

## The final film

`.juno/video/final/juno-demo-film.mp4`, 3:41, 1920×1080, rendered with
HyperFrames from `.juno/video/final/hf/index.html` (written by
`scripts/demo/build_hf.py`). Text is Plus Jakarta Sans, the landing page's font.

- **Layout.** Follows the Mixkit app-promo template (#596): a dark stage, the
  phone alternating sides with a lime disc behind it, a 3D swing between
  chapters, and titles that type in letter by letter. The phone body is drawn
  in HTML over the cropped screen recording, so the disc can sit behind it.
  There are no chapter numbers.
- **Voiceover.** ElevenLabs `eleven_multilingual_v2`, voice
  `JBFqnCBsd6RMkjVDRZzb`, at speed 1.2 (`scripts/demo/vo_eleven.py`). The script
  is in `vo.py` (`LINES`). The key comes from the `ELEVENLABS_API_KEY`
  environment variable and is never saved.
- **Subtitles.** Burned in from the ElevenLabs word timings, one phrase at a
  time, with each word lit in lime as it's spoken.
- **Music.** MusicGen small, looped under the voice at about −28 LUFS
  (`scripts/demo/music.py`).
- **Footage.** `scripts/demo/clips.py` crops the screen out of each iOS take
  and fast-forwards it to fit its line (1.8× to 3×). Nothing is cut.

| Starts | Section |
|---|---|
| 0:00 | “Gone Public” cat film (its own sound) |
| 0:20 | Landing page, scrolled in a browser window |
| 0:30 | Problem card |
| 0:40 | Phone fly-in with two reels either side |
| 0:45 | A wallet in seconds |
| 0:53 | Every post has a price |
| 1:04 | Reels are markets too |
| 1:19 | Real likes, real comments |
| 1:27 | Posting is launching (live receipts) |
| 1:44 | Reels launch the same way |
| 2:07 | Creators get paid |
| 2:15 | Pre-IPO, on a curve (Tessera) |
| 2:29 | Listed stocks, priced by Pyth |
| 2:40 | Depth, and exact-out (Meteora) |
| 2:51 | Graduation to DAMM v2 |
| 2:58 | Live on mainnet |
| 3:17 | How it's built |
| 3:34 | End card |

To change a line of narration: edit `LINES` in `scripts/demo/vo.py`, run
`vo_eleven.py` for that key and normalise it into `hf/assets/audio/`. Then re-run
`clips.py` (the chapter lengths follow the voice), then `build_hf.py`, and
finally `npx hyperframes render` in `hf/`.

## Editing

- Cut every wait longer than a second. Speed up the launch's signing to 2x.
- Add a lower-third caption on each section: *Feed · Reels · Launch ·
  Pre-IPO (Tessera) · Stocks (Pyth) · Depth + exact-out (Meteora DBC) ·
  Graduation*.
- If mainnet pools exist by then, add one more beat before the close: the
  JUNOC page on Jupiter (`jup.ag/tokens/451FRBa86C3nEAgCkqFv2P4MJUdwgH3efNLdnKYr8sBT`), with "and on mainnet".
- Export 1080×1920 (vertical) for the phone take, or 1920×1080 with the phone
  framed in the middle for a laptop take. Upload to YouTube as unlisted and put
  the link in the submission.

## If you only have one take

Do shots 1, 2, 4 and 5 (feed, buy, post, Pre-IPO). That's 1:40 and covers the
main track plus Tessera. The rest is bonus.
