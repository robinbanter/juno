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
Tests       npm test   →  8 files, 90 tests
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
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` or `mainnet-beta`. Switches the RPC default, the USDC mint, and whether explorer links carry `?cluster=devnet`. |

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
| `PYTH_MAX_AGE_SECONDS` | Defaults to 600. A price older than this is shown as stale, never as a number. |
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

Two things to understand before doing it:

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
