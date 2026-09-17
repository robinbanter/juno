# Juno

**A social app where every post is a live market.**

Publishing a post or a reel launches a [Meteora Dynamic Bonding Curve][dbc]
pool for it on Solana. People buy into the content itself as they scroll. The
creator earns trading fees on their own work instead of ad revenue. When a pool
raises its `migrationQuoteThreshold` it graduates into a **Meteora DAMM v2**
pool and becomes a normal AMM market that outlives the app.

Built for the Solana **STOCKLANA** hackathon.

This is the short version. [README.md](./README.md) is the full one — the same
claims with every pool, every signature and the dependency disclosure.

---

## What is real, and what is not

This section is deliberately first. Every claim below is verifiable on an
explorer or by running a script in this repo.

### Real and working

| | |
|---|---|
| **DBC pools created by this code** | **7 on devnet**, all four presets exercised — highlights below, full table in [README.md](./README.md) |
| **Real swaps through the app's own path** | a buy *and* a sell, links below; the curve moved both ways |
| **A full lifecycle** | launch → trade → curve to 100% → **migrated to DAMM v2** |
| **Creator fees claimed** | 0.009653 SOL, on-chain |
| **Token metadata** | pinned to IPFS, URI written to the mint |
| **Curve configs** | 4 presets, 16 liquidity-weighted segments each |
| **Persistence** | Neon Postgres (`juno_pools`), writes verified through the API |
| **Reads** | price, curve progress, migration threshold, holders, transactions — all from chain per request |
| **Wallet** | Phantom / Solflare via `@solana/wallet-adapter` |
| **Quotes** | priced by the DBC quoter against live account state |
| **Comments** | MongoDB via `lib/juno/social.ts`, wired to `app/api/juno/comments` — kept out of Postgres so a comment outage cannot take the market data down. Code reviewed, not runtime-verified. |
| **Swap history** | direction, size, execution price and trader per trade, from token-balance deltas — driving the price chart, 24h volume and trade rows |
| **Tests** | 157 unit tests, incl. every preset validated by Meteora's own `validateConfigParameters` |

### Not built

| | Why |
|---|---|
| **Pyth NAV band** | Code is written (`lib/juno/pyth.ts`) but Hermes moved its price endpoints behind an API key, and none exists in this repo. The UI shows no NAV rather than a fabricated one. |
| **Mainnet pool** | Devnet only so far. |
| **Consistent swap history** | The indexer is built (`lib/juno/indexer.ts`) and verified on two devnet pools, but the public devnet RPC enforces a per-method quota. When it refuses, the chart, 24h volume and trade rows fall back to the honest empty state. A dedicated `NEXT_PUBLIC_SOLANA_RPC` is what makes it consistent. See [README.md](./README.md). |
| **Likes** | Not persisted. `ReelCard` holds `liked` in local state; nothing populates `coin.likes`, so it does not survive a reload. |
| **Follows** | Not built. `followers` is hardcoded to `0`. |

There is **no mock data layer**. `lib/juno/mock.ts` was deleted; if a pool is
not on-chain and in the registry, it does not appear in the app.

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
- **Sell of 5,000 NVDAx**: [`xWxpJFtZ…RYQJg9`](https://solscan.io/tx/xWxpJFtZB8ZzpHLVPZshHgYvuEHSJ9vKertf9yrovrfu1rup1oGLzaVs8W5BEx1mB8XD8QkkBks47JL4CRYQJg9?cluster=devnet)
  — slot 499958074, `err: null`. `juno:inspect` on this mint now reports curve
  progress **0.0114%**, down from 0.0117%: the sell moved the curve back.

**Juno Graduation Demo** — `content` preset, SOL-quoted, **fully graduated**
- Mint: [`HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9`](https://solscan.io/token/HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9?cluster=devnet)
- DBC pool: [`F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ`](https://solscan.io/account/F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ?cluster=devnet)
- Curve driven 0% → **100.0000%** across 8 real buys, the last via `SwapMode.PartialFill`
- **Migration tx**: [`4HatkGNZ…VTZtc`](https://solscan.io/tx/4HatkGNZKu5d9S79ZtjyAng9tRFshjhJRFbhqJQczqbgyAEonhm7cF5fmUy52CFbGgzdtRvHmWPmNo4uKbMVTZtc?cluster=devnet)
- **Resulting DAMM v2 pool**: [`EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L`](https://solscan.io/account/EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L?cluster=devnet) — 1112 bytes, owned by `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

**TSLAx Issuance** — `tight-nav` preset, USDC-quoted, IPFS metadata
- Pool: [`C2CxpSxXLkfuJcytAY75mJYwP6T7nmi8qg5WpUGiqbrL`](https://solscan.io/account/C2CxpSxXLkfuJcytAY75mJYwP6T7nmi8qg5WpUGiqbrL?cluster=devnet)
- Mint: [`D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F`](https://solscan.io/token/D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F?cluster=devnet)
- On-chain metadata URI: `ipfs://QmejDQjPhsuUVNPa7tmk5AvKZXwHLjevuXM5UBjfBSKYaD` —
  resolves to real Metaplex JSON, tagged with the `Equity.US.TSLA/USD` feed

**Three reel coins**, launched with real video pinned to IPFS — `Night Market,
District Nine` and `Foundry, 4am` on `content`, `Transit Spine` on `thin-name`.
Pools, mints and creation signatures are in [README.md](./README.md).

**Creator fee claim** (NVDAx): [`3X4g3aDg…9HdAN`](https://solscan.io/tx/3X4g3aDgpW8QKAF8WB3JD18L7S73SqUjen8MYFunqWLBdGxykWYVGT2t1DiwUMgANBpU9zx3d2c2zWGyZnA9HdAN?cluster=devnet) — 0.009653 SOL claimed, balance to zero

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

```bash
npm install
cp .env.local.example .env.local   # or write it yourself — table below
npm run db:push
npm run dev
```

Routes: `/explore` · `/reels` · `/coin/[mint]` · `/creator/[wallet]` ·
`/create` · `/activity`

### Scripts

```bash
npm run juno:launch   -- --preset ipo-book --name "AAPLx Issuance" --symbol AAPLXI --quote usdc --yes
npm run juno:inspect  -- --mint <baseMint>
npm run juno:trade    -- --mint <baseMint> --side buy  --amount 0.5  --yes
npm run juno:trade    -- --mint <baseMint> --side sell --amount 5000 --yes
npm run juno:trade    -- --mint <baseMint> --side buy --amount 0.01 --partial --yes
npm run juno:swaps    -- --mint <baseMint>
npm run juno:claim    -- --mint <baseMint> --yes
npm run juno:graduate -- --mint <baseMint> --preset content --yes
```

Each runs the same code path the UI uses, signed by a local key at
`.juno/launcher.json` instead of a browser wallet. `juno:launch` generates that
key on first run; fund it from the devnet faucet before launching.

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres for the pool registry |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC` | Dedicated RPC. The public endpoints rate-limit hard enough to break a demo. |
| `PINATA_JWT` | Pins media and token metadata to IPFS. Without it a mint launches with `uri: ""` and wallets render it blank. |
| `PYTH_API_KEY` | Optional. Without it, no NAV band is shown. |

---

## Dependencies

Open-source, as required by the submission rules:

- [`@meteora-ag/dynamic-bonding-curve-sdk`](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk) — DBC client (MIT)
- [`@solana/web3.js`](https://github.com/solana-labs/solana-web3.js), [`@solana/wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) — Solana client and wallets (Apache-2.0)
- [Next.js](https://nextjs.org) 16, [React](https://react.dev) 19, [Tailwind CSS](https://tailwindcss.com) 4 (MIT)
- [Drizzle ORM](https://orm.drizzle.team) (Apache-2.0), [lucide-react](https://lucide.dev) (ISC), [qrcode](https://github.com/soldair/node-qrcode) (MIT)

[dbc]: https://docs.meteora.ag/developer-guides/dbc
