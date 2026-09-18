# Deploying Juno

Everything here has been verified against this tree. Nothing in it has been
run against a real host — no project exists, nothing is deployed, and the
deploy itself is deliberately left to a human.

---

## What the build actually needs

```
Node        20+
Build       npm ci && npm run build
Output      Next.js 16 App Router, standalone server (not a static export)
Start       npm start
Tests       npm test   →  11 files, 123 tests
```

`npm run build` is green. Six of the 20 routes prerender as static (`/`,
`/_not-found`, `/create`, `/icon.png`, `/manifest.webmanifest`,
`/opengraph-image`); every other Juno page is server-rendered on demand,
because every number on them is read from the DBC program per request.

**This cannot be a static export.** `/explore`, `/coin/[address]`,
`/creator/[handle]`, `/reels` and `/activity` are all `force-dynamic`, and the
API routes under `/api/juno` need a Node runtime for Postgres and MongoDB.

---

## Environment variables

Full annotated list in [`.env.local.example`](./.env.local.example), which is
tracked and kept in sync — every `process.env` reference in the source is
documented there apart from `NODE_ENV`, which the framework sets.

### Required — the app will not serve without these

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres (Neon). Holds `juno_pools` — identity and provenance only. Run `npm run db:push` once against it before first boot. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet`, `mainnet-beta`, or `mainnet-fork` (see *Rehearsing on a mainnet fork*). Switches the RPC default, the USDC mint, and whether explorer links carry `?cluster=devnet`. |

### Strongly recommended

| Variable | Why it matters |
|---|---|
| `NEXT_PUBLIC_SOLANA_RPC` | **The single highest-value variable to set.** The public endpoints enforce a per-method quota that the swap indexer exhausts in about a dozen reads, which is what turns the price chart, 24h volume and trade direction into em-dashes. Measured: over the same 12 signatures a 200ms gap landed 10 of 12, while 400ms and 700ms landed zero — it is a quota, not a rate window, so no amount of client-side pacing substitutes for a dedicated endpoint. |
| `NEXT_PUBLIC_SITE_URL` | Absolute base for metadata and OG images. Unset, shared links advertise `http://localhost:3000`. |
| `PINATA_JWT` | Needed to *launch* a coin. Without it a mint is created with `uri: ""`, and because Juno's presets renounce update authority that is permanent — every wallet and explorer renders the coin blank forever. Browsing works fine without it. |

### Optional

| Variable | Absent behaviour |
|---|---|
| `MONGODB_URI` / `MONGODB_DB` | Comments, likes and follows. The routes throw; nothing else is affected, and the counts render as zero rather than breaking the page. |
| `PYTH_API_KEY` | Nothing is lost: Pyth prices are read from Solana accounts. The key only enables a Hermes fallback for feeds the chain cannot answer. |
| `PYTH_MAX_AGE_SECONDS` | Defaults to 600 on devnet, 180 on mainnet and `mainnet-fork`. A price older than this is shown as stale, never as a number. |
| `PYTH_RPC_URL` | Where Pyth accounts are read. Default: the app's RPC on devnet/mainnet; **live mainnet on `mainnet-fork`**, because a fork's cloned Pyth accounts never update. Set it to the fork's RPC to read the clones instead. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Gateway baked into pinned metadata for wallets and explorers that cannot reach this app's own `/api/ipfs/<cid>` route. |
| `ALERT_WEBHOOK_URL` | Fatal errors are still logged; this is only how a human gets paged. |
| `DATABASE_URL_UNPOOLED` / `DATABASE_DIRECT_URL` | Migrations fall back to `DATABASE_URL`. On Neon, `npm run db:push` through the pooler can fail; set one of these if it does. |
| `DATABASE_POOL_MAX` | Defaults to 5. Keep it small on serverless — every instance opens its own pool. |
| `DATABASE_SSL` | `require` (default for hosted Postgres) or `disable` for a local server without TLS. |
| `JUNO_DEBUG` | Makes the swap indexer log *why* a history read came back empty. Leave unset in production. |

Note that `NEXT_PUBLIC_*` variables are inlined into the client bundle at build
time. Changing one requires a rebuild, not just a restart — and nothing secret
may ever be given a `NEXT_PUBLIC_` prefix.

---

## Steps

1. **Provision Postgres.** Neon or any Postgres 14+. Copy the connection string.
2. **Push the schema:** `DATABASE_URL=... npm run db:push`. This creates
   `juno_pools`. It is the only migration the app needs.
3. **Provision MongoDB** if you want comments, likes and follows. Atlas free
   tier is enough. Skip it and those surfaces render zero.
4. **Get a dedicated Solana RPC** — Helius, QuickNode, Triton. See above for
   why this is not optional in practice.
5. **Set the environment variables** on the host, from the tables above.
6. **Deploy.** Framework preset Next.js; build `npm run build`; install
   `npm ci`; output is handled by the adapter. No custom build command needed.
7. **Verify** with the health endpoint:

Real response from `npm start` on this tree, with no dedicated RPC configured:

```json
{
  "status": "ok",
  "cluster": "devnet",
  "checks": {
    "database": { "ok": true },
    "rpc": { "ok": true, "detail": "slot 500017516" },
    "dedicatedRpc": {
      "ok": false,
      "detail": "public endpoint — per-method quota will throttle reads"
    }
  }
}
```

`503` names the component that failed. `dedicatedRpc.ok: false` is **not** an
outage and does not affect the status — it reports that you are on a public
endpoint, which predicts the indexer degrading.

---

## Going to mainnet

Set `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` and rebuild. The switch is
complete in code — `lib/juno/cluster.ts` picks the RPC and explorer links,
`lib/juno/dbc.ts` picks the USDC mint (`EPjFWdd5…Dt1v` on mainnet,
`4zMMC9srt…DncDU` on devnet), and the DBC program id is identical on both, so
nothing else changes. There are no hardcoded devnet assumptions outside that
module; this was checked by grep across the whole source tree.

### Rehearsing on a mainnet fork

`NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-fork` runs the whole STOCKLANA flow on real
mainnet state without spending anything. It uses **mainnet addresses** (Circle
USDC `EPjFWdd5…Dt1v`, mainnet Pyth accounts) against a **local RPC**
(`http://127.0.0.1:8899` unless `NEXT_PUBLIC_SOLANA_RPC` says otherwise).
Explorer links go to the Solana Explorer with `cluster=custom`, since Solscan
cannot see a local validator, and registry rows are scoped to `mainnet-fork`, so
fork pools never appear on a real mainnet deployment. Airdrops are allowed;
`juno:launch` still refuses to airdrop on `mainnet-beta`.

```bash
npm run juno:fork                  # 25 accounts, each checked read-only on mainnet
npm run -s juno:fork -- --args > /tmp/fork-args.txt
args=("${(@f)$(cat /tmp/fork-args.txt)}")          # zsh; bash: mapfile -t args < /tmp/fork-args.txt
solana-test-validator --reset "${args[@]}"
```

What gets cloned, and why (`lib/juno/fork.ts` derives it from the code's own
constants, so it cannot drift):

- **Programs:** DBC `dbcij3LW…MaqN`, DAMM v2 `cpamdpZC…1sGG`, Metaplex Token
  Metadata `metaqbxx…18x1s`.
- **Funded PDAs:** the DAMM v2 pool authority `HLnpSz9h…TLcC` and the DBC pool
  authority `FhVo3mqL…HLuM`. These are easy to miss. On mainnet they are
  system accounts holding SOL, and the DAMM v2 authority pays the rent for the
  pool that graduation creates. Without it, migration fails inside
  `InitializePool` with `Transfer: insufficient lamports 0, need 2770080`,
  which was found by running the flow, not by reading the SDK.
- **DAMM v2 configs** for the three fee tiers the presets graduate into:
  `7F6dnUcR…yNESd` (option 0), `2nHK1kju…ha1z6k` (1), `Hv8Lmzmn…8RXcjp` (2).
- **USDC mint** `EPjFWdd5…Dt1v`.
- **Pyth price accounts** for SOL/USDC/USDT and AAPL/NVDA/TSLA/MSFT/AMZN on
  shards 0 and 1 — only read when `PYTH_RPC_URL` points at the fork. By default
  a fork reads Pyth from live mainnet (`lib/juno/pyth-source.ts`), because
  cloned price accounts freeze when the validator starts.

Verified on a fork (validator on port 8917): a `content` launch, fill to 100%,
creator claim (0.439 SOL), and migration into DAMM v2 pool `5BeBWkeH…iTUgwvu` all
succeeded. A USDC-quoted `ipo-book` issuance tagged `Equity.US.AAPL/USD`
launched against mainnet USDC. `juno:pyth` read mainnet AAPL at $336.25 from
the cloned shard-1 account. `/api/health` reported `cluster: mainnet-fork`.

Two limits:

- **Pyth clones go stale; the default avoids them.** A cloned price account is a
  snapshot that `solana-test-validator` never refreshes. So on `mainnet-fork`
  Pyth is read from live mainnet by default (read-only; 180 s max age), which
  keeps the NAV band live. Point `PYTH_RPC_URL` at the fork only to read the
  clones deliberately, and expect *Stale* a few minutes after startup.
- **No USDC to trade with.** Only Circle can mint USDC, so a USDC-quoted pool
  launches but cannot be bought into until the trader has a USDC token account.
  Inject one at startup (`--account <ata> <json>` with a crafted SPL token
  account), or use a fork tool with a set-token-balance cheatcode. SOL-quoted
  pools need nothing extra.

Two things to understand before going to mainnet itself:

- **The registry is cluster-scoped, not cluster-shared.** `juno_pools` stores a
  `cluster` column and every query filters on it, so devnet pools will simply
  not appear. A fresh mainnet deployment starts with an empty Explore page
  until something is launched on it.
- **A launch on mainnet is permanent and costs real SOL.** The config key and
  the base mint are both permanent accounts, and the presets renounce mint
  authority by design. Rehearse on devnet first — that is what devnet is for,
  and it is why every pool in the README is a devnet pool.

---

## Deliberately not done here

No deploy has been run, no project or remote resource has been created, and
nothing has been pushed. Publishing is the repository owner's decision, and it
has not been authorised. This document exists so that decision is a single
command away rather than an afternoon of archaeology.
