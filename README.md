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
| **DBC pools created by this code** | **8**, all devnet, all eight creation signatures confirmed `err: null` — listed below |
| **Presets exercised on chain** | all four (`content`, `thin-name`, `ipo-book`, `tight-nav`) |
| **A real buy** | 0.5 SOL into NVDAx; curve progress 0.0000% → 0.0117% |
| **A real sell** | 5,000 NVDAx back to the pool; curve progress now reads **0.0114%** |
| **A full lifecycle** | launch → 8 buys → curve at **100.0000%** → **migrated to DAMM v2** — and a second, `thin-name`, through the issuer tooling (`lib/juno/issuer.ts`) |
| **Creator fees claimed** | 0.009653 SOL, `claimCreatorTradingFee`, balance to zero; then 0.000504652 and 0.05382363 SOL through `lib/juno/issuer.ts` |
| **Issuer tooling** | `/coin/<mint>/manage`: live curve progress, quote reserve vs `migrationQuoteThreshold`, price, fee decay (opening / now / floor, countdown), preset matched from the on-chain config, the 16 liquidity weights, claimable fees + Claim, Migrate to DAMM v2. Same functions as `juno:inspect` / `juno:claim` / `juno:graduate`. The browser-built claim and migrate transactions simulate clean on devnet; a real browser-wallet signature has not been done by a human |
| **Token metadata** | pinned to IPFS via Pinata, URI written to the mint at creation |
| **Reel media** | real video pinned to IPFS, served through `/api/ipfs/<cid>` with server-side gateway failover |
| **Registry** | Neon Postgres (`juno_pools`) — identity and provenance only |
| **Every number that moves** | price, curve progress, migration threshold, holders, transactions — read from the DBC program per request, never cached into the registry |
| **Wallet** | Phantom / Solflare via `@solana/wallet-adapter` |
| **Quotes** | priced by `pool.swapQuote` against live account state |
| **Likes and follows** | Persisted in MongoDB (`lib/juno/social.ts`, `app/api/juno/likes`, `app/api/juno/follows`), keyed with unique indexes so a wallet can like a coin or follow a creator exactly once. Verified against the real database, including six simultaneous toggles that never pushed a count past the number of distinct wallets. Counts render for everyone; the action needs a connected wallet, and there is no optimistic increment. |
| **Swap history** | Direction, size, execution price and trader reconstructed per trade from token-balance deltas — driving a real price chart, real 24h volume, and real trade rows |
| **Tests** | **107 unit tests across 10 files**, passing — including all four presets asserted against Meteora's own `validateConfigParameters`, and both deprecated paths (DAMM v1, `RateLimiter`) asserted unused |

There is **no mock data layer**. `lib/juno/mock.ts` was deleted; if a pool is not
on-chain *and* in the registry, it does not appear in the app.

### Not built, or not proven

| | Why |
|---|---|
| **Mainnet pool** | Devnet only. Needs real SOL and explicit sign-off. |
| **Pyth NAV band on devnet** | Built: Pyth is read from its `PriceUpdateV2` accounts on Solana — no key, no Hermes — and the coin page and trade panel check the curve against `navBandBps`. But **Pyth stopped pushing US equities on devnet on 2026-07-02**, so the equity pools show **Stale** with the last publish date rather than a months-old number. On mainnet all five equity feeds are live (shard 1). SOL/USD is live on devnet, which is what prices SOL-quoted pools in dollars. `npm run juno:pyth` prints every feed. |
| **Consistent swap history** | The indexer is built and verified (see below), but the public devnet RPC enforces a per-method quota that a dozen transaction reads can exhaust. When it refuses, the chart, 24h volume and trade direction all fall back to the honest empty state. A dedicated `NEXT_PUBLIC_SOLANA_RPC` is what makes this consistent. |
| **Comments** | Genuinely implemented — `lib/juno/social.ts` is a MongoDB-backed layer wired to `app/api/juno/comments`. Code-present and reviewed, **not runtime-verified here**: no live round trip was run against the database. |
| **Browser-wallet launch** | The create flow signs and sends through the same code path the CLI does, and that path is verified on devnet — but the Phantom-in-a-browser run has not been done by a human. |
| **Dedicated RPC** | Running on the public devnet endpoint, which rate-limits hard. `NEXT_PUBLIC_SOLANA_RPC` is wired and unset. |

---

## On-chain proof (devnet)

Program, identical on mainnet and devnet:
[`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://solscan.io/account/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet)

Deployer: [`9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE`](https://solscan.io/account/9CHr5g24EdzUKg9GZFUvEuAvHAjZGCsF1Z3zVPudWYoE?cluster=devnet)

### The eight pools

| Coin | Preset | Format | Quote | Pool | Creation tx |
|---|---|---|---|---|---|
| **AAPLx Issuance** | `ipo-book` | post | devnet USDC | [`9DnKw5r5…ZSxFa`](https://solscan.io/account/9DnKw5r5rYx1JoGmwLU2yCXFhKDkypaycuebrwrZSxFa?cluster=devnet) | [`4NiD7oZB…dxRAh3`](https://solscan.io/tx/4NiD7oZBfbGc7gNtVSyDgtTFohUSMYHMBEpxGQN6qsDbmYBTncLSpjuQXQovS39FvGZeCedmsAqT7msqX5dxRAh3?cluster=devnet) |
| **NVDAx Issuance** | `thin-name` | post | SOL | [`FGcLWvDc…RBHpK`](https://solscan.io/account/FGcLWvDcKibyFnm1VRbWvX3CGwNDt6nCmWnPjT7RBHpK?cluster=devnet) | [`e9DMG7ZN…z4HjA6`](https://solscan.io/tx/e9DMG7ZNEwbMrY5JFpaVPiWwBab5hiA3GkX5wXz5mmtRjbRqNbTk362gr4AJKnTc3kzBipPNZXmpi9nz6z4HjA6?cluster=devnet) |
| **TSLAx Issuance** | `tight-nav` | post | devnet USDC | [`C2CxpSxX…iqbrL`](https://solscan.io/account/C2CxpSxXLkfuJcytAY75mJYwP6T7nmi8qg5WpUGiqbrL?cluster=devnet) | [`2dft7yAS…5ykrns`](https://solscan.io/tx/2dft7yASHTy4doWeHRxCd4N93SBNTeB45VTLLuRXWcFUrJPAkMo1qanAF6bgaiD1wMfAoeMS2Y38KMvJqD5ykrns?cluster=devnet) |
| **Juno Graduation Demo** | `content` | post | SOL | [`F6A77CbT…8ZowZ`](https://solscan.io/account/F6A77CbTHKFTc1d89KR2VReJRBiis5HuKpqvipg8ZowZ?cluster=devnet) | [`RZscb41j…imGoBQ`](https://solscan.io/tx/RZscb41j5tfknzKSmGvFKG4TuRNLSxs3k5pez9xeQTT8TNsZ3qEhsS4tTXVJ3yx1zJtkSiV6ZVHQXM4x5imGoBQ?cluster=devnet) |
| **Night Market, District Nine** | `content` | reel | SOL | [`3kXH227N…rGM44`](https://solscan.io/account/3kXH227Niyztfd89asv1eprC9f6Y5p8YgaVvHmLrGM44?cluster=devnet) | [`5gNCvd5v…buugCi`](https://solscan.io/tx/5gNCvd5vULwcw6HQtx5Fe4hkGSKGkJMgfGkRhBBNQN5TmJkFWX2obmqgG44uyQSqEax5kZ9zsMLzqzz5vQbuugCi?cluster=devnet) |
| **Foundry, 4am** | `content` | reel | SOL | [`FiLgdmSn…CSsX3Z`](https://solscan.io/account/FiLgdmSnVaC8ynuhFhDi9x5QxNnggkfY4FwsQyCSsX3Z?cluster=devnet) | [`5evn1DtK…K56H24`](https://solscan.io/tx/5evn1DtKV4AYfeGLMs6Vp9rdoNWBVH7wyNB5xdjzVDeaMo1DKTGV5HBM1DV4QYXUqRrH5ZgHF4WTrvcJTaK56H24?cluster=devnet) |
| **Transit Spine** | `thin-name` | reel | SOL | [`ACFyGPsL…qkJWAz`](https://solscan.io/account/ACFyGPsLKmhTBQ6XhoSfytzJr1tkSqkU1UdM97qkJWAz?cluster=devnet) | [`2k5iabQY…bEaxne`](https://solscan.io/tx/2k5iabQYVQeBbKFfCC5bGBGnMpXCze5xJKPCrzjriHiixoxtEzFv7YS1TTuBYWTGKv7fjzXU2LbXiNpjscbEaxne?cluster=devnet) |
| **Juno Graduation Rehearsal** | `thin-name` | post | SOL | [`8Y4XdeMd…hB9mx`](https://solscan.io/account/8Y4XdeMd2DDr3ymjYgR2DtsM7YML346R3MDK2L5hB9mx?cluster=devnet) | [`2EMDbyUY…qkP7A4b`](https://solscan.io/tx/2EMDbyUYxSwXxgE9xApbezLr38ZDW9mrERcv5w2MtRTADZhWbBw4BrsHViN5QZhgfkJYV2fZ31uHkNBdqGkP7A4b?cluster=devnet) |

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

### The swap indexer

`lib/juno/indexer.ts` reconstructs a pool's trade history from the RPC. It differences
pre/post token balances rather than decoding the program's Anchor event: balance deltas
are consensus data already present in a response we have to fetch anyway, and they
cannot drift when Meteora changes an event layout. The pool's two vaults share one
authority PDA, so that authority is the only owner in a swap holding both mints —
quote into the vault is a buy, quote out is a sell. Pool creation, fee claims and
migration each move a single leg and are rejected rather than appearing as trades.

```
$ npm run juno:swaps -- --mint 6driivZmcZ4pgfCNkVERbbNcQiyzEpKvaJJ19AXQYj69
2 swap(s) parsed in 0.9s

2026-09-16 21:57:09  BUY   base   237,911.471147  quote    0.500000000  price 2.101622e-6
2026-09-17 19:07:48  SELL  base            5,000  quote    0.009941764  price 1.988353e-6

24h volume    0.509941764 (quote units)
24h change    -5.39%
```

On the graduated pool it reads all 9 buys, price climbing 2.31e-9 → 4.16e-9 as the
back-loaded `content` curve steepens, ending in the 0.000004224 SOL partial fill that
completed the curve.

**A finding worth recording.** `getParsedTransactions` — the batched form — is refused
outright by the public devnet endpoint: a batch of 12 returns `Too many requests for a
specific RPC call`. Sequential single calls get through, but spacing them out makes it
*worse*, not better — over the same 12 signatures, a 200ms gap landed 10 of 12 while
400ms and 700ms landed **zero**. That is a quota, not a rate window: the first pass
spends it and no amount of politeness recovers it. There is therefore no configuration
that makes this reliable on the public endpoint, which is why the honesty boundary
below matters more than the parser does.

**Trades and aggregates are held to different standards.** A transaction the RPC
refuses is counted, not thrown — losing nine trades that were read because the tenth
was rate-limited would discard truth to punish a partial failure. So individual rows
and chart points render what is real, while 24h volume and total volume return null
whenever the window has holes or does not reach back a full day. Null renders as an
em-dash. Only a complete read of a pool that genuinely has not traded renders `$0`.

### Token metadata on IPFS

TSLAx's mint ([`D7PDa2u1…RBf2F`](https://solscan.io/token/D7PDa2u1Qm6dVq2D4B2ieq9gyPVr7avNJrF9PyBRBf2F?cluster=devnet))
carries `ipfs://QmejDQjPhsuUVNPa7tmk5AvKZXwHLjevuXM5UBjfBSKYaD`, which
resolves to real Metaplex JSON — name, symbol, the curve it launched on, and the Pyth
feed id it was tagged with. The three reel coins carry pinned `video/mp4`.

---

## Running it

Node 20+.

```bash
npm install
cp .env.local.example .env.local   # or write it yourself — variables in the table below
npm run db:push                    # push the juno_pools schema to Postgres
npm run dev                        # next dev --webpack
```

```bash
npm test                 # everything
npm run test:unit        # 107 tests, ~1s — the curve presets live here
npm run build            # production build — green
```

The suite used to be 140. It is smaller because the Norr tests went with the Norr
code: deleting 237 files of a forked Algorand app took the 13 test files covering it,
and `juno-routes` went too once its subject — keeping Norr's age gate off Juno's
routes — stopped existing. Nothing that guards live code was removed. Of the 107,
**84 are Juno's own** (curves 13, format 13, indexer 17, Pyth decoder + NAV band 23,
issuer tooling 9, mainnet-fork config 9) and 23 cover shared infrastructure.

Routes: `/explore` · `/reels` · `/coin/[address]` · `/creator/[wallet]` · `/create` ·
`/activity`

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres (Neon) for the `juno_pools` registry |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | yes | `devnet`, `mainnet-beta`, or `mainnet-fork` (mainnet addresses on a local validator — see [DEPLOY.md](./DEPLOY.md)) |
| `NEXT_PUBLIC_SOLANA_RPC` | recommended | A dedicated RPC. The public endpoints rate-limit hard enough to break a demo. |
| `PINATA_JWT` | for launching | Pins media and token metadata to IPFS. Without it a mint launches with `uri: ""` and every wallet renders it blank. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | no | Gateway baked into pinned metadata for wallets and explorers |
| `MONGODB_URI` / `MONGODB_DB` | no | Comments, likes and follows. Unset, those routes throw and the counts render as zero; nothing else is affected. |
| `SESSION_SECRET` | for social | Signs wallet sessions (32+ chars). Without it likes, comments and follows are refused with 503 — they are keyed by wallet, and only a signed-in wallet may act as itself. |
| `PYTH_API_KEY` | no | Pyth is read on-chain without it; the key only adds a Hermes fallback |

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

# read a pool straight off the program — the CLI face of the Manage view: price,
# curve progress, fee decay, matched preset, claimable fees, DAMM v2 target, a live quote
npm run juno:inspect  -- --mint <baseMint>

# trade against the curve
npm run juno:trade    -- --mint <baseMint> --side buy  --amount 0.5  --yes
npm run juno:trade    -- --mint <baseMint> --side sell --amount 5000 --yes

# partial fill — the only way to finish a curve; exact-in reverts on the last sliver
npm run juno:trade    -- --mint <baseMint> --side buy --amount 0.01 --partial --yes

# parsed swap history: direction, size, execution price, volume, chart points
npm run juno:swaps    -- --mint <baseMint>

# mainnet accounts a local fork must clone, checked read-only against mainnet
npm run juno:fork

# claim accrued creator trading fees (--simulate dry-runs the exact transaction)
npm run juno:claim    -- --mint <baseMint> --simulate
npm run juno:claim    -- --mint <baseMint> --yes

# migrate a completed curve into DAMM v2 — the fee tier is read off the pool's config
npm run juno:graduate -- --mint <baseMint> --simulate
npm run juno:graduate -- --mint <baseMint> --yes
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
| Comments, likes, follows | **MongoDB**, deliberately not the same store as the market data |

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

Social data — comments, likes and follows — lives in MongoDB rather than alongside
the registry on purpose: the pool registry is relational and small, while social
data is append-heavy, per-coin and
schema-loose, and keeping the two apart means a comment outage can never take the
market data down with it. Nothing in that store is authoritative about money — trades
live on chain.

### Repo note

This repo began as a fork of an unrelated Algorand app, and until recently that app
was still sitting in the tree. It is gone: **237 files, 33,173 lines**, and
**36 of 54 npm dependencies**. What remains is Solana-only, and `npm run build` is
green.

Juno keeps its namespacing — `app/(juno)/`, `components/juno/`, `lib/juno/`,
`scripts/juno-*.ts` — because the route group is still how the palette and the wallet
adapter stay scoped, not because anything else shares the app. `/` redirects to
`/explore`.

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
| [`mongodb`](https://github.com/mongodb/node-mongodb-native) | Comments, likes and follows | Apache-2.0 |
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
