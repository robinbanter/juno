# Juno

**A social app on Solana where publishing a post launches a market for it.** Every
post and reel creates a [Meteora Dynamic Bonding Curve][dbc] pool, so people buy into
the content itself as they scroll and the creator earns the trading fees instead of an
ad cut — and when a pool raises its `migrationQuoteThreshold` it graduates into a
**Meteora DAMM v2** pool with permanently locked liquidity, a normal AMM market that
outlives the app.

Built for the Solana **STOCKLANA** hackathon, targeting the Meteora *Best Use of
Dynamic Bonding Curve* track. Everything below is devnet. [JUNO.md](./JUNO.md) is the
short version of this document; [PLAN.md](./PLAN.md) is the task-by-task build log.

> **Devnet only. No mainnet pool exists.** Every explorer link on this page was
> re-verified against `api.devnet.solana.com` on 2026-09-18 before being written down.

---

## The DBC work

This is the part that is not a memecoin launchpad, and it is the part the Meteora
track is judged on.

DBC lets you place **sixteen curve segments and weight the liquidity in each**
(`buildCurveWithLiquidityWeights`). The weights are the whole design surface:

> more liquidity in a segment → more supply absorbed per unit of price → a flatter
> stretch of curve

A memecoin launch back-loads its weights: nearly free at the start, near vertical at
the end, graduate as fast as possible. That is one shape, and it is the only shape
most launchpads ship. **Three of Juno's four presets are deliberately not it**, because
an equity issuance and a meme have opposite failure modes. A meme fails by not moving;
a newly tokenized low-float name fails when a single $500 order gaps the print 40%.

| Preset | Sixteen weights | Fee decay | Supply on curve | For |
|---|---|---|---|---|
| `content` | back-loaded, `1.2^i` | 9% → 1% over 600s | 20% | a post or reel — cheap entry, steepens as it finds an audience |
| `thin-name` | **front-loaded, `0.82^i`** | 5% → 0.6% over 900s | 35% | a newly tokenized low-float stock — deep book *at the issue price*, so early size fills instead of gapping the print. Price only moves once real demand clears the opening depth. |
| `ipo-book` | deep at both ends, thin in the middle (parabolic, `0.25 + 0.75t²`) | 4% → 0.5% over 900s | 30% | book-building — depth to absorb the open, a thin middle where price is genuinely *discovered*, depth again near the target cap so the pool does not moon into nonsense before it graduates |
| `tight-nav` | uniform | 2% → 0.25% over 300s | 50% | an asset meant to track an underlying. A curve that runs away from NAV is a bug, not a feature; uniform weighting keeps it near-flat, so it behaves like a **spread**, not a launch |

`0.25%` is `MIN_FEE_BPS` — `tight-nav` sits on the floor of what the program allows.

Every preset also:

- decays fees from an anti-snipe opening to an equity-like spread via
  **`FeeSchedulerExponential`** (60 periods), and avoids `BaseFeeMode.RateLimiter`,
  which is deprecated for new configs;
- migrates to **DAMM v2** (`MigrationOption.MET_DAMM_V2`) — v1 is deprecated for new
  configs — into a fee tier chosen per preset (`FixedBps100` / `FixedBps30` /
  `FixedBps25`) that matches the spread the curve ended at;
- sets `creatorPermanentLockedLiquidityPercentage: 100`, so **migrated liquidity is
  permanently locked** and a graduated pool keeps a floor rather than letting the
  creator pull it on day one;
- routes 50% of trading fees to the creator (`creatorTradingFeePercentage`);
- renounces mint authority (`TokenAuthorityOption.Immutable`).

`tests/unit/juno-curves.test.ts` runs all four presets through the SDK's own
`validateConfigParameters`, so if Meteora tightens a constraint it fails in CI rather
than on mainnet. The presets live in [`lib/juno/curves.ts`](./lib/juno/curves.ts).

### Two findings from building this

Both cost real time, both are reproducible, and neither is in Meteora's docs.

**1. `createConfigAndPool` cannot carry a sixteen-segment curve.**

The bundled message serialises to **~1488 bytes against Solana's 1232-byte limit** and
fails at send. The obvious workaround — build the config, then call
`creator.createPool` — does not work either: `createPool` *reads the config account
from chain*, and at build time that account does not exist yet.

The working path is **`createConfigAndPoolWithFirstBuy` with no first buy**. It returns
the two transactions *separately* (**config 1109 B, pool 673 B**, both comfortably
under the limit) and takes `tokenType` from params instead of fetching it. Reducing the
curve to fewer points to fit one transaction would have gutted the exact thing being
judged, so the split is the answer.

**2. `token.leftover` is not optional.**

It reads like a nicety. The builder derives the supply the curve actually consumes
*from the curve*, and when that lands above `totalTokenSupply` the excess has to fit
inside `leftover` or the build throws `leftOverDelta must be less than totalLeftover`.
Juno reserves **1% of supply**, which absorbs the rounding across all sixteen segments
with room to spare.

Relatedly, **`leftoverReceiver` must not be `PublicKey.default`** — the validator
rejects an all-zeroes receiver, since that would burn the remainder at migration.

---

## What is real, and what is not

Verified by running things, not by reading imports.

### Real, and verifiable on an explorer

| | |
|---|---|
| **DBC pools created by this code** | **7**, all devnet, all seven creation signatures confirmed `err: null` — listed below |
| **Presets exercised on chain** | all four (`content`, `thin-name`, `ipo-book`, `tight-nav`) |
| **A real buy** | 0.5 SOL into NVDAx; curve progress 0.0000% → 0.0117% |
| **A real sell** | 5,000 NVDAx back to the pool; curve progress now reads **0.0114%** |
| **A full lifecycle** | launch → 8 buys → curve at **100.0000%** → **migrated to DAMM v2** |
| **Creator fees claimed** | 0.009653 SOL, `claimCreatorTradingFee`, balance to zero |
| **Token metadata** | pinned to IPFS via Pinata, URI written to the mint at creation |
| **Reel media** | real video pinned to IPFS, served through `/api/ipfs/<cid>` with server-side gateway failover |
| **Registry** | Neon Postgres (`juno_pools`) — identity and provenance only |
| **Every number that moves** | price, curve progress, migration threshold, holders, transactions — read from the DBC program per request, never cached into the registry |
| **Wallet** | Phantom / Solflare via `@solana/wallet-adapter` |
| **Quotes** | priced by `pool.swapQuote` against live account state |
| **Tests** | **140 unit tests across 18 files**, passing — including every preset asserted against Meteora's `validateConfigParameters` |

There is **no mock data layer**. `lib/juno/mock.ts` was deleted; if a pool is not
on-chain *and* in the registry, it does not appear in the app.

### Not built, or not proven

| | Why |
|---|---|
| **Mainnet pool** | Devnet only. Needs real SOL and explicit sign-off. |
| **Pyth NAV band** | The code exists (`lib/juno/pyth.ts`) and feed ids are stored per pool, but Hermes moved its price endpoints behind an API key and none exists in this repo. **The UI shows no NAV rather than a fabricated one.** |
| **Price chart** | Needs a swap-event indexer. The tab says so instead of drawing a fake line. |
| **24h volume** | Same reason. Rendered as `—`, never as `$0`. |
| **Trade direction and size in Activity** | Needs log decoding. Rows link to the real transaction instead. |
| **Comments and likes** | `lib/juno/social.ts` + `app/api/juno/comments` exist and write to MongoDB, but this pass did not verify the round trip, so treat it as unproven. **Follows are not built.** |
| **Browser-wallet launch** | The create flow signs and sends through the same code path the CLI does, and that path is verified on devnet — but the Phantom-in-a-browser run has not been done by a human. |
| **Dedicated RPC** | Running on the public devnet endpoint, which rate-limits hard. `NEXT_PUBLIC_SOLANA_RPC` is wired and unset. |

---

## On-chain proof (devnet)

Program, identical on mainnet and devnet:
[`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://solscan.io/account/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet)

Deployer: [`9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE`](https://solscan.io/account/9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE?cluster=devnet)

### The seven pools

| Coin | Preset | Format | Quote | Pool | Creation tx |
|---|---|---|---|---|---|
| **AAPLx Issuance** | `ipo-book` | post | devnet USDC | [`9DnKw5r5…ZSxFa`](https://solscan.io/account/9DnKw5r5rYx1JoGmwLU2yCXFhKDkypaycuebrwrZSxFa?cluster=devnet) | [`4NiD7oZB…dxRAh3`](https://solscan.io/tx/4NiD7oZBfbGc7gNtVSyDgtTFohUSMYHMBEpxGQN6qsDbmYBTncLSpjuQXQovS39FvGZeCedmsAqT7msqX5dxRAh3?cluster=devnet) |
| **NVDAx Issuance** | `thin-name` | post | SOL | [`FGcLWvDc…RBHpK`](https://solscan.io/account/FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK?cluster=devnet) | [`e9DMG7ZN…z4HjA6`](https://solscan.io/tx/e9DMG7ZNEwbMrY5JFpaVPiWwBab5hiA3GkX5wXz5mmtRjbRqNbTk362gr4AJKnTc3kzBipPNZXmpi9nz6z4HjA6?cluster=devnet) |
| **TSLAx Issuance** | `tight-nav` | post | devnet USDC | [`C2CxpSxX…iqbrL`](https://solscan.io/account/C2CxpSxXLkfuJcytAY75mJYwP6T7nmi8qg5WpUGiqbrL?cluster=devnet) | [`2dft7yAS…5ykrns`](https://solscan.io/tx/2dft7yASHTy4doWeHRxCd4N93SBNTeB45VTLLuRXWcFUrJPAkMo1qanAF6bgaiD1wMfAoeMS2Y38KMvJqD5ykrns?cluster=devnet) |
| **Juno Graduation Demo** | `content` | post | SOL | [`F6A77CbT…8ZowZ`](https://solscan.io/account/F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ?cluster=devnet) | [`RZscb41j…imGoBQ`](https://solscan.io/tx/RZscb41j5tfknzKSmGvFKG4TuRNLSxs3k5pez9xeQTT8TNsZ3qEhsS4tTXVJ3yx1zJtkSiV6ZVHQXM4x5imGoBQ?cluster=devnet) |
| **Night Market, District Nine** | `content` | reel | SOL | [`3kXH227N…rGM44`](https://solscan.io/account/3kXH227Niyztfd89asv1eprC9f6Y5p8YgaVvHmLrGM44?cluster=devnet) | [`5gNCvd5v…buugCi`](https://solscan.io/tx/5gNCvd5vULwcw6HQtx5Fe4hkGSKGkJMgfGkRhBBNQN5TmJkFWX2obmqgG44uyQSqEax5kZ9zsMLzqzz5vQbuugCi?cluster=devnet) |
| **Foundry, 4am** | `content` | reel | SOL | [`FiLgdmSn…CSsX3Z`](https://solscan.io/account/FiLgdmSnVaC8ynuhFhDi9x5QxNnggkfY4FwsQyCSsX3Z?cluster=devnet) | [`5evn1DtK…K56H24`](https://solscan.io/tx/5evn1DtKV4AYfeGLMs6Vp9rdoNWBVH7wyNB5xdjzVDeaMo1DKTGV5HBM1DV4QYXUqRrH5ZgHF4WTrvcJTaK56H24?cluster=devnet) |
| **Transit Spine** | `thin-name` | reel | SOL | [`ACFyGPsL…qkJWAz`](https://solscan.io/account/ACFyGPsLKmhTBQ6XhoSfytzJr1tkSqkU1UdM97qkJWAz?cluster=devnet) | [`2k5iabQY…bEaxne`](https://solscan.io/tx/2k5iabQYVQeBbKFfCC5bGBGnMpXCze5xJKPCrzjriHiixoxtEzFv7YS1TTuBYWTGKv7fjzXU2LbXiNpjscbEaxne?cluster=devnet) |

### AAPLx — the first pool, `ipo-book`

- Mint: [`CMjWQU2B…tBcbp`](https://solscan.io/token/CMjWQU2Bzd1NWwy1GB2qFNcpgRtW6xm9dhcjnevtBcbp?cluster=devnet)
- Config: [`7cu21Neo…nFmsS`](https://solscan.io/account/7cu21NeoDjZ74VckNXhAnfo7Ahq5r5T1xTBAKnpnFmsS?cluster=devnet) (1048 bytes, owned by the DBC program)
- Config tx: [`2X1zcRbE…a7Shtz`](https://solscan.io/tx/2X1zcRbEQoT527dvtRMnxAihmu4t91ZfeKxDvMSmTP7CFnXBK8zaHuYjQ86mvyizfnWrY6LdpzqrrZ61QNa7Shtz?cluster=devnet) — the two-transaction split, on chain

### NVDAx — a buy and a sell, `thin-name`

- Mint: [`6driivZm…QYj69`](https://solscan.io/token/6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69?cluster=devnet)
- **Buy, 0.5 SOL**: [`59DBxUgP…QJwdGzV`](https://solscan.io/tx/59DBxUgPPjANJhKEmuxp5FMXL4sSR77Uxs8kefRhMuKQkptnVMgSbPvN6YZfUCQ2KfUJWXWZjmSyEzuZzQJwdGzV?cluster=devnet)
  — curve progress 0.0000% → 0.0117%, price 0.000002 → 0.0000020004
- **Sell, 5,000 NVDAx**: [`xWxpJFtZ…CRYQJg9`](https://solscan.io/tx/xWxpJFtZB8ZzpHLVPZshHgYvuEHSJ9vKertf9yrovrfu1rup1oGLzaVs8W5BEx1mB8XD8QkkBks47JL4CRYQJg9?cluster=devnet)
  — slot 499958074, confirmed `err: null`. `npm run juno:inspect` on this mint now
  reports curve progress **0.0114%**, down from 0.0117%: the sell moved the curve back.
- **Creator fee claim**: [`3X4g3aDg…zWGyZnA9HdAN`](https://solscan.io/tx/3X4g3aDgpW8QKAF8WB3JD18L7S73SqUjen8MYFunqWLBdGxykWYVGT2t1DiwUMgANBpU9zx3d2c2zWGyZnA9HdAN?cluster=devnet)
  — 0.009653 SOL claimed, accrued balance to zero

### The graduation — `content`, driven to 100% and migrated

- Mint: [`HYgG9w3D…smZQ9`](https://solscan.io/token/HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9?cluster=devnet)
- Curve driven 0% → **100.0000%** across 8 real buys. The last one had to use
  `pool.swap2` with **`SwapMode.PartialFill`**: exact-in reverts with
  `Insufficient Liquidity` once the input exceeds remaining curve capacity, which
  turned the final 0.000004 SOL into a binary search until `PartialFill` solved it.
- **Migration tx**: [`4HatkGNZ…bMVTZtc`](https://solscan.io/tx/4HatkGNZKu5d9S79ZtjyAng9tRFshjhJRFbhqJQczqbgyAEonhm7cF5fmUy52CFbGgzdtRvHmWPmNo4uKbMVTZtc?cluster=devnet)
- **Resulting DAMM v2 pool**: [`EhvtVimk…MYy7L`](https://solscan.io/account/EhvtVimkraeSqtNZGqBj3zMxHMUVHdwMDUwZF8MMYy7L?cluster=devnet)
  — 1112 bytes, owned by `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`, liquidity permanently locked

A live read of the DBC pool confirms the end state:

```
$ npm run juno:inspect -- --mint HYgG9w3DrsiNn7tPHFeACGnCdtnioyC9DeiukausmZQ9
cluster            devnet
pool               F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ
curve progress     100.0000%
raised             1.59040715
threshold          1.59040715
graduated          true
```

### Token metadata on IPFS

TSLAx's mint ([`D7PDa2u1…RBf2F`](https://solscan.io/token/D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F?cluster=devnet))
carries `ipfs://QmejDQjPhsuUVNPa7tmk5AvKZXwHLjevuXM5UBjfBSKYaD`, which
resolves to real Metaplex JSON — name, symbol, the curve it launched on, and the Pyth
feed id it was tagged with. The three reel coins carry pinned `video/mp4`.

---

## Running it

Node 20+. There is no `.env.local.example` in the repo — create `.env.local` yourself
with the variables below.

```bash
npm install
# create .env.local (see the table), then:
npm run db:push          # push the juno_pools schema to Postgres
npm run dev              # next dev --webpack
```

```bash
npm test                 # everything
npm run test:unit        # 140 tests, ~3s — the curve presets live here
npm run build            # production build
```

Routes: `/explore` · `/reels` · `/coin/[address]` · `/creator/[wallet]` · `/create` ·
`/activity`

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres (Neon) for the `juno_pools` registry |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | yes | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC` | recommended | A dedicated RPC. The public endpoints rate-limit hard enough to break a demo. |
| `PINATA_JWT` | for launching | Pins media and token metadata to IPFS. Without it a mint launches with `uri: ""` and every wallet renders it blank. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | no | Gateway baked into pinned metadata for wallets and explorers |
| `MONGODB_URI` / `MONGODB_DB` | no | Comments and likes |
| `PYTH_API_KEY` | no | Without it, **no NAV band is shown** — see the honesty table above |

The CLI scripts read the same `.env.local` via `dotenv-cli` and sign with a local key
instead of a browser wallet.

### CLI

Every one of these runs the exact code path the UI uses. They sign with a local keypair
at `.juno/launcher.json` — `juno:launch` generates one on first run if it is missing, so
fund it from the devnet faucet before launching. `.juno/` is gitignored; the key never
leaves your machine. Add `--mainnet` to `juno:launch` only once devnet has worked.

```bash
# launch a pool: config tx + pool tx, curve preset of your choice
# --quote defaults to SOL (the only mint guaranteed to exist on devnet); --nav tags
# the pool with a Pyth feed id, recorded in the registry and in the pinned metadata
npm run juno:launch   -- --preset ipo-book --name "AAPLx Issuance" --symbol AAPLXI \
                         --quote usdc --nav "Equity.US.AAPL/USD" --yes

# read a pool straight off the program: price, curve progress, threshold, a live quote
npm run juno:inspect  -- --mint <baseMint>

# trade against the curve
npm run juno:trade    -- --mint <baseMint> --side buy  --amount 0.5  --yes
npm run juno:trade    -- --mint <baseMint> --side sell --amount 5000 --yes

# partial fill — the only way to finish a curve; exact-in reverts on the last sliver
npm run juno:trade    -- --mint <baseMint> --side buy --amount 0.01 --partial --yes

# claim accrued creator trading fees
npm run juno:claim    -- --mint <baseMint> --yes

# migrate a completed curve into DAMM v2
npm run juno:graduate -- --mint <baseMint> --preset content --yes
```

---

## Architecture

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** App Router, React 19, TypeScript, Tailwind v4 |
| Juno surface | the **`(juno)` route group** — `app/(juno)/`, `components/juno/`, `lib/juno/` |
| Market | **Meteora DBC** (`@meteora-ag/dynamic-bonding-curve-sdk` v1.5.12) → **DAMM v2** on graduation |
| Wallets | **`@solana/wallet-adapter`** — Phantom, Solflare |
| Chain client | `@solana/web3.js` v1 |
| Registry | **Neon Postgres via Drizzle ORM** — `juno_pools`, identity and provenance only |
| Media & metadata | **Pinata / IPFS**, proxied through `/api/ipfs/<cid>` with gateway failover |
| Social | MongoDB (comments, likes) — deliberately not in the same store as the market data |

`lib/juno/dbc.ts` is the only module that touches the DBC program. Components receive
plain numbers in UI units; that module owns the BN arithmetic, the decimals and the
account decoding. Two things the Anchor-derived types get wrong are handled at that
boundary: `VirtualPool` resolves to its outer wrapper (the real fields are under
`.poolState`), and `SwapResult` collapses to `any`.

Curve progress comes from `state.getPoolQuoteTokenCurveProgress` — the program's own
quote-side ratio, which is what actually gates migration. A price-derived approximation
would be a different number wearing the same label. Quote decimals come from the quote
**mint**, not the config: `PoolConfig` carries only `tokenDecimal`, which is the base side.

The DAMM v2 pool address is *derived*, not stored — `deriveDammV2PoolAddress` over the
migration fee config, base mint and quote mint, and the fee config follows from the
curve preset.

### Repo note

This repo grew out of an unrelated prior app and still contains its code. Juno is
namespaced under `app/(juno)/`, `components/juno/`, `lib/juno/` and `scripts/juno-*.ts`.
`lib/juno/routes.ts` declares the route prefixes Juno owns, and
`tests/unit/juno-routes.test.ts` asserts that list covers every directory under
`app/(juno)/` — a missing entry renders correctly and then gets the old app's chrome
painted over it, which is a silent failure. Removal of the legacy surface is in progress.

---

## Open-source dependencies

Disclosed as the submission rules require.

| Package | Role | Licence |
|---|---|---|
| [`@meteora-ag/dynamic-bonding-curve-sdk`](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk) | DBC client — curve builders, swaps, migration | MIT |
| [`@solana/web3.js`](https://github.com/solana-labs/solana-web3.js) | Solana RPC and transaction client | Apache-2.0 |
| [`@solana/wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) | Phantom / Solflare connection | Apache-2.0 |
| [Next.js](https://nextjs.org) 16 | App framework | MIT |
| [React](https://react.dev) 19 | UI | MIT |
| [Tailwind CSS](https://tailwindcss.com) 4 | Styling | MIT |
| [Drizzle ORM](https://orm.drizzle.team) + `drizzle-kit` | Postgres schema and queries | Apache-2.0 |
| [`pg`](https://github.com/brianc/node-postgres) | Postgres driver | MIT |
| [`mongodb`](https://github.com/mongodb/node-mongodb-native) | Comments and likes | Apache-2.0 |
| [`bn.js`](https://github.com/indutny/bn.js) / [`decimal.js`](https://github.com/MikeMcl/decimal.js) | Curve and price arithmetic | MIT |
| [`bs58`](https://github.com/cryptocoinjs/bs58) | Base58 keys and signatures | MIT |
| [lucide-react](https://lucide.dev) | Icons | ISC |
| [`qrcode`](https://github.com/soldair/node-qrcode) | Get-the-app QR | MIT |
| [Vitest](https://vitest.dev) | Test runner | MIT |
| [`tsx`](https://github.com/privatenumber/tsx) / [`dotenv-cli`](https://github.com/entropitor/dotenv-cli) | CLI scripts | MIT |

Infrastructure used but not bundled: Solana devnet RPC, Neon Postgres, Pinata (IPFS),
Solscan, and the Meteora DBC program — which is on chain, not vendored.

---

## Further reading

- [JUNO.md](./JUNO.md) — the condensed version of this page
- [PLAN.md](./PLAN.md) — every task, with its verification status
- [docs/juno-design.md](./docs/juno-design.md) — design tokens, component map, and why each curve is shaped the way it is
- [docs/meteora-audit.md](./docs/meteora-audit.md) — which of the SDK's 60 service methods are actually called, and the 50 features ranked by how load-bearing Meteora is
- [docs/juno-brief.md](./docs/juno-brief.md) — the pre-implementation brief written for external review. **It is a snapshot from before the on-chain work landed and its "current state" section is out of date;** this page supersedes it.

[dbc]: https://docs.meteora.ag/developer-guides/dbc
