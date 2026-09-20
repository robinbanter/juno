# Juno

**A social app where every post is a live market.**

Publishing a post or a reel launches a [Meteora Dynamic Bonding Curve][dbc]
pool for it on Solana. People buy into the content itself as they scroll. The
creator earns trading fees on their own work instead of ad revenue. When a pool
raises its `migrationQuoteThreshold` it graduates into a **Meteora DAMM v2**
pool and becomes a normal AMM market that outlives the app.

Built for the Solana **STOCKLANA** hackathon.

There are two surfaces. **`juno-expo/`** is the mobile app and the one to look
at. The **Next.js app** at the repo root serves the web UI and the API the phone
talks to.

---

## What is real, and what is not

This section is deliberately first. Every claim below is verifiable on an
explorer or by running something in this repo.

### Real and working

| | |
|---|---|
| **DBC pools created by this code** | 4 on devnet, links below |
| **Real swaps through the app's own path** | links below; the curve moved |
| **A full lifecycle** | launch → trade → curve to 100% → **migrated to DAMM v2** |
| **Creator fees claimed** | 0.009653 SOL, on-chain |
| **Mobile app** | Expo, five tabs, real data on every screen |
| **Transactions built server-side, signed on the device** | the key never leaves the phone; `4YM9pnRu…QLsq` is a devnet buy landed from server-built bytes |
| **Pyth NAV band** | read from `PriceUpdateV2` accounts **on-chain**, no API key |
| **Swap history, 24h volume, price chart** | decoded from pool vault deltas — no indexer |
| **Portfolio with cost basis and P&L** | average-cost, derived from this wallet's own decoded trades |
| **Token metadata** | pinned to IPFS, URI written to the mint |
| **Curve configs** | 4 presets, 16 liquidity-weighted segments each |
| **Persistence** | Neon Postgres (`juno_pools`, `juno_posts`) |
| **Tests** | 172 unit + live integration tests, incl. every preset validated by Meteora's own `validateConfigParameters` and every Pyth feed id resolved on-chain |

### Two things this project had written off, and was wrong about

**Pyth does not need an API key.** Hermes really is gated now — its price
endpoints answer 401 on every deployment, which is why the NAV band was shelved.
But Pyth publishes on Solana, and a `PriceUpdateV2` account costs one
`getAccountInfo` against the RPC already in use. For a Solana app that is the
better integration anyway: the UI shows the price a Solana program would see.

Two details the layout forces. The feeds are sharded and the shards are **not**
equally fresh — crypto is current on shard 0, equities on shard 1 — so both are
read and the newer wins. And an equity feed stops publishing when the exchange
closes, so a weekend mark is Friday's close; that is reported as "market closed,
last close" rather than dressed up as live.

**Trade history does not need an indexer.** Every swap moves the pool's two
vault token accounts in opposite directions, and those deltas are already in the
transaction the RPC returns. Base down and quote up is a buy; the reverse is a
sell; anything else is not a trade, which is how pool creation, fee claims and
migration filter themselves out. That one decode produces the activity feed, 24h
volume, total volume, the price chart and the 24h change.

Before this, every Activity row shipped as `side: "buy"` with a zero amount — a
trading feed asserting a direction it had never read, which rendered real sells
as buys.

### Not built

| | Why |
|---|---|
| **Mainnet pool** | Devnet only, by decision. Nothing in the code prevents it: switch the cluster and fund a key. |
| **Privy embedded wallet** | Integrated, but it needs a mobile client registered for this bundle id in Privy's dashboard — account configuration that cannot be done from the repo. The app signs with a device key in the iOS keychain instead. That is real Ed25519 signing against devnet, not a simulation, and the profile screen says it is not recoverable rather than implying a custody story it does not have. |
| **iOS Simulator run** | Xcode is installed on the dev machine but `xcode-select` points at the command-line tools. One sudo command fixes it — see `DEPLOY.md`. Verified on Expo web meanwhile. |
| **Likes and follows** | Not persisted. Comments and creator posts are. |
| **Holders count on a throttled RPC** | `getTokenLargestAccounts` is refused outright by the public endpoint under load, so it degrades to unknown rather than to zero. |

### A note on the public RPC

Juno runs against `api.devnet.solana.com` with no API key, deliberately. That
shapes real engineering: the endpoint refuses *batched* `getParsedTransactions`
outright as a per-method policy, so transactions are fetched in small paced
batches; reads retry with jittered backoff; a short read is reported as partial
rather than summed into a total that would look authoritative; and values choose
their own cache TTL so a throttled read is retried in seconds instead of being
served for a minute.

The visible consequence is that a page can legitimately come back short. Where
that happens the UI says so — it never renders an unknown as a zero.

---

## On-chain proof (devnet)

**AAPLx Issuance** — `ipo-book` preset, USDC-quoted
- Pool: [`9DnKw5r5rYx1JoGmwLU2yCXFhKDkypaycuebrwrZSxFa`](https://solscan.io/account/9DnKw5r5rYx1JoGmwLU2yCXFhKDkypaycuebrwrZSxFa?cluster=devnet)
- Mint: [`CMjWQU2Bzd1NWwy1GB2qFNcpgRtW6xm9dhcjnevtBcbp`](https://solscan.io/token/CMjWQU2Bzd1NWwy1GB2qFNcpgRtW6xm9dhcjnevtBcbp?cluster=devnet)
- Config: [`7cu21NeoDjZ74VckNXhAnfo7Ahq5r5T1xTBAKnpnFmsS`](https://solscan.io/account/7cu21NeoDjZ74VckNXhAnfo7Ahq5r5T1xTBAKnpnFmsS?cluster=devnet)
- Launch tx: [`4NiD7oZ…x5dxRAh3`](https://solscan.io/tx/4NiD7oZBfbGc7gNtVSyDgtTFohUSMYHMBEpxGQN6qsDbmYBTncLSpjuQXQovS39FvGZeCedmsAqT7msqX5dxRAh3?cluster=devnet)

**NVDAx Issuance** — `thin-name` preset, SOL-quoted
- Pool: [`FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK`](https://solscan.io/account/FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK?cluster=devnet)
- Mint: [`6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69`](https://solscan.io/token/6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69?cluster=devnet)
- **Buy of 0.5 SOL**: [`59DBxUgP…wdGzV`](https://solscan.io/tx/59DBxUgPPjANJhKEmuxp5FMXL4sSR77Uxs8kefRhMuKQkptnVMgSbPvN6YZfUCQ2KfUJWXWZjmSyEzuZzQJwdGzV?cluster=devnet)
  — curve progress 0.0000% → 0.0117%, price 0.000002 → 0.0000020004

**Juno Graduation Demo** — `content` preset, SOL-quoted, **fully graduated**
- Mint: [`HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9`](https://solscan.io/token/HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9?cluster=devnet)
- DBC pool: [`F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ`](https://solscan.io/account/F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ?cluster=devnet)
- Curve driven 0% → **100.0000%** across 8 real buys, the last via `SwapMode.PartialFill`
- **Migration tx**: [`4HatkGNZ…VTZtc`](https://solscan.io/tx/4HatkGNZKu5d9S79ZtjyAng9tRFshjhJRFbhqJQczqbgyAEonhm7cF5fmUy52CFbGgzdtRvHmWPmNo4uKbMVTZtc?cluster=devnet)
- **Resulting DAMM v2 pool**: [`EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L`](https://solscan.io/account/EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L?cluster=devnet) — 1112 bytes, owned by `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

**TSLAx Issuance** — `tight-nav` preset, USDC-quoted, IPFS metadata
- Mint: [`D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F`](https://solscan.io/token/D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F?cluster=devnet)
- On-chain metadata URI: `ipfs://QmejDQjPhsuUVNPa7tmk5AvKZXwHLjevuXM5UBjfBSKYaD`

**Creator fee claim** (NVDAx): [`3X4g3aDg…9HdAN`](https://solscan.io/tx/3X4g3aDgpW8QKAF8WB3JD18L7S73SqUjen8MYFunqWLBdGxykWYVGT2t1DiwUMgANBpU9zx3d2c2zWGyZnA9HdAN?cluster=devnet) — 0.009653 SOL claimed, balance to zero

**A buy signed the way the phone signs it** — bytes built by the server, signed
locally, submitted and confirmed:
[`4YM9pnRu…QLsq`](https://solscan.io/tx/4YM9pnRuUx8KXWyU4xNRDQE35RUT6hPM4mpvCaqvAyo4xbH6CEv8ziMEenJnGdPn4aAVN5kb9a1H9n4HnxHqQLsq?cluster=devnet)
— reproduced by `npm run test:integration`.

Program (identical on mainnet and devnet):
[`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://solscan.io/account/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet)

---

## The DBC work

DBC allows **sixteen curve segments with a liquidity weight each**
(`buildCurveWithLiquidityWeights`). The weights set the character of a launch:

> more liquidity in a segment → more supply absorbed per unit of price → a
> flatter stretch of curve

A memecoin launch back-loads its weights: nearly free at the start, near
vertical at the end, graduate as fast as possible. Three of Juno's four presets
are deliberately not that.

| Preset | Weights | For |
|---|---|---|
| `content` | back-loaded `1.2^i` | a post or reel; cheap entry, steepens with attention |
| `thin-name` | **front-loaded** `0.82^i` | a newly tokenized low-float stock — deep book at the issue price so early size fills instead of gapping the print |
| `ipo-book` | deep at both ends, thin in the middle | book-building: absorb the open, discover price mid-curve, flatten near the target cap |
| `tight-nav` | uniform | an asset meant to track an underlying; behaves like a spread, not a launch |

All four decay fees from an anti-snipe opening to an equity-like spread via
`FeeSchedulerExponential`, migrate to **DAMM v2** (v1 is deprecated for new
configs), avoid the deprecated `RateLimiter` fee mode, and permanently lock
migrated liquidity so a graduated pool keeps a floor.

### Two findings worth reading

**`createConfigAndPool` cannot carry a sixteen-segment curve.** The bundled
message serialises to ~1488 bytes against Solana's 1232 limit and fails at
send. `creator.createPool` alone does not work either — it reads the config
account from chain, which does not exist at build time. The working path is
`createConfigAndPoolWithFirstBuy` with no first buy, which returns the two
transactions *separately* (config 1109B, pool 673B) and takes `tokenType` from
params instead of fetching. Reducing curve points to fit one transaction would
have gutted the exact thing being judged.

**`token.leftover` is not optional.** The builder derives consumed supply from
the curve; any excess over `totalTokenSupply` must fit inside `leftover` or it
throws `leftOverDelta must be less than totalLeftover`. Juno reserves 1%.
Relatedly `leftoverReceiver` must not be `PublicKey.default` — the validator
rejects it, since an all-zeroes receiver would burn the remainder at migration.

---

## Running it

Two things to start. The API first, then the app.

```bash
# 1. the API + web UI
npm install
cp .env.local.example .env.local   # DATABASE_URL, PINATA_JWT, NEXT_PUBLIC_SOLANA_CLUSTER=devnet
npm run db:migrate
npm run dev                        # http://localhost:3000
npm run juno:seed-posts            # so the feed is not empty

# 2. the mobile app
cd juno-expo
npm install
npx expo start --ios               # needs Xcode; see DEPLOY.md if simctl is missing
```

The app finds the API automatically from the host Metro was served on. Point it
somewhere else with `EXPO_PUBLIC_API_URL` in `juno-expo/.env`.

Web routes: `/explore` · `/reels` · `/coin/[mint]` · `/creator/[wallet]` ·
`/create` · `/activity`

App tabs: Social · Trade · **Post** · Reels · Profile

### The API the app talks to

| Endpoint | What it does |
|---|---|
| `GET /api/juno/feed` | Real trades and creator posts, interleaved |
| `GET /api/juno/coins` | Market list, sortable by cap or graduation progress |
| `GET /api/juno/coins/[mint]` | One coin: price, curve, NAV band, chart series, activity |
| `GET /api/juno/portfolio/[wallet]` | Holdings, cost basis, P&L |
| `POST /api/juno/tx/swap` | An **unsigned** swap, plus the quote it was built against |
| `POST /api/juno/tx/launch` | The two **unsigned** launch transactions |
| `POST /api/juno/tx/submit` | Submit what the device signed, confirm, drop stale caches |

### Scripts

```bash
npm run juno:launch   -- --preset ipo-book --name "AAPLx Issuance" --symbol AAPLXI --quote usdc --yes
npm run juno:inspect  -- --mint <baseMint>
npm run juno:trade    -- --mint <baseMint> --side buy --amount 0.5 --yes
npm run juno:claim    -- --mint <baseMint> --yes
npm run juno:graduate -- --mint <baseMint> --preset content --yes
npm run juno:seed-posts
```

Each runs the same code path the app uses, signed by a local key instead of a
device.

### Tests

```bash
npm run test:unit         # 172, deterministic, no network
npm run test:integration  # live devnet + on-chain Pyth reads; nothing is signed
```

The one worth reading is `tests/integration/juno-tx.test.ts`. It takes the bytes
the server builds, signs them locally exactly as the phone does, submits them,
and requires the cluster to confirm — because every screen in the mobile app is
built on that path, and a version of it that did not land would make all of them
a demonstration of something that does not work.

---

## Dependencies

Open-source, as required by the submission rules:

- [`@meteora-ag/dynamic-bonding-curve-sdk`](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk) — DBC client (MIT)
- [`@solana/web3.js`](https://github.com/solana-labs/solana-web3.js), [`@solana/wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) — Solana client and wallets (Apache-2.0)
- [Expo](https://expo.dev) 57, [React Native](https://reactnative.dev) 0.86, [expo-router](https://docs.expo.dev/router/introduction/) (MIT)
- [`@privy-io/expo`](https://www.privy.io) — embedded wallets (Apache-2.0)
- [Next.js](https://nextjs.org) 16, [React](https://react.dev) 19, [Tailwind CSS](https://tailwindcss.com) 4 (MIT)
- [Drizzle ORM](https://orm.drizzle.team) (Apache-2.0), [lucide-react](https://lucide.dev) (ISC), [qrcode](https://github.com/soldair/node-qrcode) (MIT)

Pyth price feeds are read directly from their on-chain accounts; no SDK is
vendored for it.

[dbc]: https://docs.meteora.ag/developer-guides/dbc
