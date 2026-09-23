# Juno — every post is a market

**Post a photo or a reel and it launches its own [Meteora Dynamic Bonding Curve](https://docs.meteora.ag/)
pool on Solana.** People buy into the post itself as they scroll, the creator
earns the trading fees instead of ad revenue, and when a curve fills it
graduates into a Meteora **DAMM v2** pool that outlives the app.

The same machinery issues **pre-IPO and stock trackers**: curves shaped like
issuances and marked against a real reference — **Tessera** T-tokens for
OpenAI, Kalshi and SpaceX, **Pyth** equity feeds for AAPL, MSFT, NVDA, TSLA.

Built for the Solana **STOCKLANA** hackathon.

| | |
|---|---|
| **Try it** | **https://juno-app-chi.vercel.app** — the Expo app's web build. Open it on a phone, or on a laptop it runs in a phone-width frame. |
| **Network** | Solana **devnet**. No real money. Profile → *Get devnet SOL* funds a new wallet. |
| **API** | https://juno-web-production-bd2e.up.railway.app/api/juno/… |
| **Landing** | https://juno-landing-beta.vercel.app |
| **Deep dive** | [JUNO.md](JUNO.md) — on-chain proof, the DBC findings, what is and is not built |

## Sixty seconds in the app

1. **Feed** — posts, each one a market: worth, likes, replies, share, **Buy**.
   "Bought by" is read from real swaps.
2. **Reels** — full-screen video; tap for sound, double-tap to like, and a
   dock under the caption with the reel's market cap, curve progress, **Sell** and **Buy**.
3. **Trade → Pre-IPO** — OpenAI, Kalshi, SpaceX from Tessera's live marks,
   with the Juno curve tracking each and how far its implied price sits from the mark.
4. **+ → Post a photo** — pick a photo, name it, pick a curve shape; two
   signatures later it is a live pool with your post on it.
5. **Profile** — fund the wallet, choose a name, see holdings, cost basis and P&L.

Every number is read from the chain, Postgres, Mongo, Pyth or Tessera. When a
read fails the app says so — it does not print a zero it never measured.

## What makes it more than a launchpad

- **Four curve presets, sixteen liquidity-weighted segments each** —
  `content` (back-loaded), `thin-name` (front-loaded, for a low-float stock),
  `ipo-book` (deep at both ends), `tight-nav` (uniform, tracks a reference).
  Each is validated by Meteora's own `validateConfigParameters` in the test suite.
- **Pre-IPO names with no oracle.** Pyth has no feed for a company that has not
  listed; Tessera does, and Juno reads its public API and the T-token mints on
  mainnet to mark a curve against it.
- **No indexer.** Fills are decoded from pool vault deltas in the transactions
  the RPC already returns; that one decode drives activity, volume, the chart,
  cost basis and "Bought by".
- **Keys never leave the device.** The server builds unsigned transactions;
  the phone signs; the server submits.
- **A full lifecycle on devnet** — launch → trade → curve to 100% → migrated to
  DAMM v2 → creator fees claimed. Links in [JUNO.md](JUNO.md#on-chain-proof-devnet).

## Layout

| Path | What |
|---|---|
| `juno-expo/` | **The app** — Expo (iOS, Android, web). |
| `app/api/juno/` | The API the app calls. |
| `lib/juno/` | Curves, DBC client, swap decoding, Pyth, Tessera, portfolio. |
| `app/(juno)/` | An earlier Next.js web UI for Juno. |
| `scripts/juno-*.ts` | Launch, trade, claim, graduate from the command line. |

This repository began as **Norr**, an Algorand product; its code is still in
the Next.js app but is not part of Juno and is not served by the Juno
deployment. Its old README is in [docs/legacy/](docs/legacy/NORR-README.md).

## Run it

```bash
npm install
cp .env.local.example .env.local   # DATABASE_URL, PINATA_JWT, MONGODB_URI, NEXT_PUBLIC_SOLANA_CLUSTER=devnet
npm run db:migrate
npm run dev                         # API on http://localhost:3000

cd juno-expo && npm install
npx expo start                      # i = iOS simulator, a = Android, w = web
```

Tests: `npm run test:unit` (curves, decoding, portfolio maths) and
`npm run test:integration` (live devnet and mainnet reads).
Deploying: [DEPLOY.md](DEPLOY.md).
