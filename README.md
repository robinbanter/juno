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
| **Network** | The app runs on Solana **devnet**: no real money, and Profile → *Get devnet SOL* funds a new wallet. The four curve presets are also **[live on mainnet](#live-on-mainnet)**. |
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
- **Measured, not just named.** All four presets quoted on one config, so
  the weights are the only difference ([table](JUNO.md#the-presets-measured-on-one-config)).
  The measurement caught a false claim: uniform weights are *not* flat over a
  wide range, so `tight-nav` now sets its own narrow range and refuses a wide one.
- **Depth, not just price.** The coin page draws what a buy of each size moves
  the price, from live `swapQuote` calls; the trade sheet offers the largest
  size that stays under a 1% move, and can buy an **exact number of tokens**
  (`SwapMode.ExactOut`).
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

## Live on mainnet

The app runs on devnet so anyone can try it for free. The curves also run on
**Solana mainnet**: one pool per preset, launched 25 Sep 2026 by
`scripts/mainnet-proof.sh`, all nine transactions finalized.

| Pool | Curve | Quote | Open it | Launch transactions |
|---|---|---|---|---|
| **Juno Content** `JUNOC` | `content` | SOL | [Jupiter](https://jup.ag/tokens/451FRBa86C3nEAgCkqFv2P4MJUdwgH3efNLdnKYr8sBT) · [pool](https://solscan.io/account/DYq4PbgvcyRZ38tYyv5gz7x4mpZbgrFMKqn7bzMw3Nto) · [token](https://solscan.io/token/451FRBa86C3nEAgCkqFv2P4MJUdwgH3efNLdnKYr8sBT) | [config](https://solscan.io/tx/3PY1gxx7Wvhk3dqm8jrakJ7bGQLvmc6hfiyJxT19HuGysmSfLcmUgVSpSwgBTAdTUgNxdj1ZTYSTbaALXnSodMHy) · [pool](https://solscan.io/tx/ugoSAUhHqfdJYxYzaQpj3oGdJyZeRnr9Z44AsRVdD4yYRmZni6RtqNtszdjRyuSAS2GnGrjQ9Hw6Qq3ZftcW4j6) |
| **Juno Thin Name** `JUNOTN` | `thin-name` | USDC | [Jupiter](https://jup.ag/tokens/G5bhx1QKkD1mxB9yHLQQimczgpwNRVriiJPfXsDH11Jf) · [pool](https://solscan.io/account/ETgRZABKT6KTxJHctSQiQ1WbjBrU2DoFmeUrASu7AMMg) · [token](https://solscan.io/token/G5bhx1QKkD1mxB9yHLQQimczgpwNRVriiJPfXsDH11Jf) | [config](https://solscan.io/tx/56EQ8EknroEJSo4JmoRm8gxXhYr9nAsrMbHXj2iYVoHhGgHWGZrAJ2HtewFahGMx9CBUjRijPoYuqQAfk32fjVCC) · [pool](https://solscan.io/tx/2JTHEvq9MkapzfQPdDheS76Tu9q7qyiAP4Jqpe7ZgohpdoCoSwQbTNtxuQkQ71dBrCUQ2HhvheE9xaeJKLYWgeu8) |
| **Juno IPO Book** `JUNOIB` | `ipo-book` | USDC | [Jupiter](https://jup.ag/tokens/HH5xiMDeTBbH2j2ne5Hs9wat2BNmN2JCczpm27LGGUVf) · [pool](https://solscan.io/account/8jEvf8ZRCaD5sxcy8cbwN6zWmLeJhjcDTJxdQ7yuJ1ai) · [token](https://solscan.io/token/HH5xiMDeTBbH2j2ne5Hs9wat2BNmN2JCczpm27LGGUVf) | [config](https://solscan.io/tx/5pdVEXr1cFnrFQJtEgZi2i5HdF3sfEazHjiaZWWQewAmVTSnKC1VVur7cvEH8EBJeF9j1JeV71Tq1ijf7v3mMEbZ) · [pool](https://solscan.io/tx/gu99UTLwroQTmdF8NfH6HQN7tX8QNcLRMz4gGTD6cFhE9RU9UskstBuK5gxXhhEWWQVcnPhj9bSA9AFANaS7c6V) |
| **Juno Tight NAV** `JUNOTV` | `tight-nav` | USDC | [Jupiter](https://jup.ag/tokens/5RG2N4uyA4f9b3ZUiYbFbsQkZsUN1kjLBBJ9MVRkp9jA) · [pool](https://solscan.io/account/Hvk85BYY5sFxvWgUiaFtGMHb2bcm8MbYypXaVtcFkw3J) · [token](https://solscan.io/token/5RG2N4uyA4f9b3ZUiYbFbsQkZsUN1kjLBBJ9MVRkp9jA) | [config](https://solscan.io/tx/4frQyQxZ4rTRKKnxHCyQRZtwpefTp94nnkFRaR4rMwmZX6nwUkUJXLRXnySFvN8TMh9yVUaERGx4CtFwPRzesvkL) · [pool](https://solscan.io/tx/3VYqpMk4HHA6pdnRHg3UpND6pmLAwnKzP3A1GXoR9KFKcDdwMr6EjGfD1aU9TLdNs4i35R3KSk16jTgo798Gwb7X) |

**Indexed by Jupiter within minutes.** [JUNOC on Jupiter](https://jup.ag/tokens/451FRBa86C3nEAgCkqFv2P4MJUdwgH3efNLdnKYr8sBT)
shows its price chart, holders and trades by other wallets, $100 to $440
each, in its first hour. Meteora's app has no page for a DBC pool, so the
links above go to Jupiter and Solscan.

**A real mainnet buy:** 0.01 SOL of JUNOC, [`DWAAoN5U…`](https://solscan.io/tx/DWAAoN5Uj344EyGwNK9AiG4UR48x5sCDqWRLccBxop67Nez11vSBs6DqqmpXgjt2UvCPhozvDz1DT5q42jsLFgV).

**The anti-sniper fee, working as designed.** JUNOC opened in the same second
that bots fired eleven buys at it (3 landed, 8 failed), with another eleven
seconds later ([pool history](https://solscan.io/account/DYq4PbgvcyRZ38tYyv5gz7x4mpZbgrFMKqn7bzMw3Nto)).
The `content` preset opens at a 9% fee that decays to 1% over ten minutes, so
every one of them paid 9% on the way in, and those fees went to the creator.

Launcher `47uNkySS2FmZ9QoMWyMnzPWK56FChaAxSRbyToSu3Dv8`. Total cost of the
run: 0.118 SOL, nearly all of it account rent. Rehearsed first on devnet with
the identical script, and each config transaction simulated on mainnet before
anything was sent.

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
