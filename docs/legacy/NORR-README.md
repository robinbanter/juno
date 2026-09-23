# Norr

Pay-per-tap premium content, settled on **Algorand** in **real USDC**. Fans
connect a wallet, deposit their own USDC, and unlock creators' posts, tips, and
calls — every payment moves USDC on-chain, with the media served from private
storage behind short-lived signed URLs.

> Formerly "Unveil"/"Zorr". Migrated end-to-end from an EVM (Tempo) payment
> stack to Algorand.

**Demoing this?** [DEMO.md](./DEMO.md) is the 60-second walkthrough — runs on
TestNet, no setup beyond `npm run dev && npm run seed`.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| Auth | [Privy](https://privy.io) wallet login → signed session cookie (`lib/privy-session.ts`) |
| Wallets | `@txnlab/use-wallet` — Pera, Defly, Exodus, Kibisis, Lute, + Privy embedded |
| Payments | **Real USDC** on Algorand (MainNet `31566704` / TestNet `10458941`), custodial ed25519 wallets (`lib/algorand.ts`, `lib/custodial-wallets.ts`) |
| Machine payments | **x402** on Algorand — `@x402/core` + `@x402/avm` + `@x402/next` (`lib/x402.ts`, `app/api/x402/`) |
| Database | PostgreSQL + Drizzle ORM (`lib/db/`) |
| Media | Supabase Storage (private bucket, signed URLs) — `lib/blob.ts` |

### How payments work

Each user gets a **custodial Algorand wallet** (an ed25519 keypair, secret key
AES-encrypted at rest). Its USDC balance *is* their balance — read live from the
chain, mirrored by the SQL ledger.

**There is no treasury and nothing is minted.** Users fund themselves:

- **Add funds** (`/add-funds`) → the user sends their own USDC to their wallet
  address. The balance moves on its own; no card, no processor, no float.
- **Unlock** → a purchase, recorded once. Reopening a post you own costs nothing
  and it appears in your Collection. (`PERSIST_UNLOCK_OWNERSHIP=false` reverts to
  charge-per-view for a throwaway demo — never set it anywhere real.)
- **Tip / call** → the user's wallet transfers USDC to the creator's custodial
  wallet. Recipients are auto-provisioned (opt-in) since the platform holds
  their key.
- **Withdraw** (`/withdraw`) → the user sends their USDC back out to any wallet
  they control. This is what makes the platform a two-way door: creators earn
  into a custodial wallet, so without it their money could never leave.

Withdrawal is the only endpoint that moves funds to an address supplied in the
request, so it validates hard: real address (checksum included), never the
wallet's own address, recipient must be opted in to USDC (or the network bounces
the transfer), and the amount is capped by *spendable* balance — on-chain minus
escrow — so money reserved for an in-flight call can't be pulled out from under
the settlement about to claim it.

The platform account's only job is **gas**: it holds ALGO and seeds each new
wallet ~0.3 ALGO so it can meet Algorand's min-balance and pay fees. It never
funds anyone's USDC balance.

> **Why provisioning exists.** Algorand rejects an asset transfer to an account
> that hasn't opted in to that asset. So a wallet must be seeded with ALGO and
> opted in *before* its address is shown — otherwise the user's deposit would
> bounce. That's what `POST /api/account/deposit-address` does.

> **Card top-ups are not implemented.** Selling USDC for a card payment needs a
> real processor *and* a funded treasury to sell out of; the mock card that used
> to do this has been removed, since on MainNet it would have handed out real
> money to anyone with a fake card number.

### x402: the same content, machine-payable

Norr's premium posts are also served as real [x402](https://x402.org) resources —
HTTP-native payments, so an agent can buy content with no account, no session and
no card. Same posts, same prices, same USDC, paid straight to the creator.

```
GET /api/x402/posts            -> free: the catalog (id, title, price, network, asset)
GET /api/x402/posts/{id}       -> 402 + signed payment requirements
GET /api/x402/posts/{id}       -> 200 + a short-lived signed media URL
    with PAYMENT-SIGNATURE
```

Try it — this is a real client that pays real USDC:

```bash
npm run x402:buy -- --list     # what's for sale
npm run x402:buy               # buy the cheapest post
npm run x402:buy -- <postId>   # buy a specific one
```

It needs `X402_BUYER_MNEMONIC` — a wallet holding USDC. It does **not** need ALGO:
the facilitator sponsors the transaction fee (`extra.feePayer` in the 402), so a
payer only ever needs the token it's paying with.

| Piece | Where |
| --- | --- |
| Resource server (prices routes, verifies + settles) | `lib/x402.ts`, `app/api/x402/` |
| Facilitator (verifies the signature, submits on-chain) | external — `X402_FACILITATOR_URL` |
| Client (signs the payment) | `scripts/x402-buy.ts` |

Routes use `withX402`, not the proxy, so settlement happens only when the handler
succeeds — nobody is charged for a post whose media then fails to serve. Pricing
and `payTo` are resolved per request, which is what lets each post carry its own
price and pay its own creator.

> **The default facilitator is not x402.org's.** That one is EVM-only and cannot
> settle Algorand; `X402_FACILITATOR_URL` defaults to an AVM-capable facilitator
> instead. Check `GET /supported` before pointing it elsewhere.

### Network: TestNet vs MainNet

`NEXT_PUBLIC_ALGO_NETWORK` is the single switch — it selects the algod/indexer
endpoints, the explorer, the USDC asset id, and the wallet connector's network.
It **defaults to `testnet`**; MainNet (real money) must be opted into explicitly.

Before going live, run the gate:

```bash
npm run mainnet:preflight   # read-only; never sends a transaction
```

It verifies against the live chain that asset `31566704` really is USDC, that the
facilitator settles MainNet Algorand, that no sandbox override is redirecting the
payment asset, that the platform holds gas and is opted in — and that the
platform key isn't one whose mnemonic has leaked. "It worked on TestNet" proves
almost none of that: different asset, different accounts, real gas, and secrets
that were fine on a throwaway wallet are suddenly guarding real funds.

Going live costs ~0.3 ALGO per existing custodial wallet (one-off, to seed and
opt each in) plus ~0.3 per new signup. That gas is the platform's only cost —
it never funds anyone's USDC.

Everything the gate still blocks on is money, legal identity, or a vendor
account — none of it is code. **[LAUNCH.md](./LAUNCH.md)** walks each one in the
order that unblocks the most, starting with replacing the platform key (the
TestNet mnemonic has been pasted in plaintext, so preflight blocks it by
address).

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Env** — copy and fill:
   ```bash
   cp .env.local.example .env.local
   ```
   You'll need: a Privy app id, a Postgres URL, Supabase Storage creds, a
   session secret, a custodial-key encryption secret, and an Algorand deployer.

3. **Database** — apply the schema:
   ```bash
   npm run db:migrate    # production; `db:push` is fine for local iteration
   ```

4. **Algorand** — fund the platform account with ALGO for gas
   (TestNet: <https://bank.testnet.algorand.network>), then opt it in to USDC so
   it can receive revenue:
   ```bash
   npm run wallet:setup   # opts the platform in + reports its gas budget
   ```
   To try payments on TestNet, get free test USDC from
   [Circle's faucet](https://faucet.circle.com) (choose "Algorand Testnet") and
   send it to the address shown on `/add-funds`.

5. **Media** — create a private Supabase Storage bucket named `media` (or set
   `SUPABASE_STORAGE_BUCKET`).

6. **Seed** (optional) demo creator + posts + unlocks:
   ```bash
   npm run seed
   ```

## Run

```bash
npm run dev        # dev server (Turbopack) → http://localhost:3000
npm run build      # production build (webpack) + serwist service worker
npm run build:turbo # faster Turbopack build (skips the service worker)
npm start          # serve the production build
```

> The default build uses webpack because serwist generates the PWA service
> worker (`public/sw.js`) there. `@txnlab/use-wallet-ui-react` inlines its font
> as a `new URL("data:font/woff2;…", import.meta.url)`, which webpack's asset
> rules mistype — `next.config.ts` disables `new URL()` parsing for just that
> package to fix it.

## Tests

```bash
npm test                 # everything
npm run test:unit        # pure logic — no network, no DB
npm run test:integration # live reads against Algorand TestNet
npm run test:e2e         # API flows (needs `npm run dev` running)
```

| Layer | Covers |
| --- | --- |
| **Unit** | Session cookie signing/verification (incl. tamper rejection), Solana→Algorand address conversion, money normalisation, explorer URLs, USDC asset ids + the testnet-by-default guard, that our USDC constants match the x402 SDK's (two sources of truth for "which token is money" would silently misprice content), rate limits (incl. that the dev relaxation can't leak into production), and that a broken/misconfigured content scanner never resolves to "publish anyway" |
| **Integration** | Live reads: that the shipped asset id really *is* USDC on-chain with 6dp, platform gas + USDC opt-in, fresh accounts reading 0 (never throwing), network/asset/mnemonic validation |
| **E2E** | Auth gating (protected pages redirect, protected APIs 401), the Privy session endpoint, the wallet balance endpoint, `available == on-chain − escrow`, **deposit provisioning** (address is really opted in, idempotent, mock-card routes gone), **x402** (a real 402 with signed requirements, per-post price in atomic units, creator's real address, sponsored fees, forged signatures rejected, media never leaked unpaid), **withdrawal guards** (bad checksum, own wallet, non-opted-in recipient, escrow-aware cap) + a real on-chain send, **moderation** (anonymous reporting, operator-only queue, and that a takedown or a scanner quarantine actually stops the content being served from feed, unlock AND x402), **the paywall** (a paid post never serves its original as a preview), and the **full creator→fan loop** (upload → publish → unlock → signed media URL) |

> **Tests that move money need a funded wallet** (withdrawal transfer, call
> escrow); they skip on an empty one. Fund the custodial wallet shown on
> `/add-funds` with TestNet USDC from [Circle's faucet](https://faucet.circle.com)
> ("Algorand Testnet") and the full 86 run.
>
> E2E files run **sequentially** (`fileParallelism: false`): they all drive the
> same dev user, so they share one on-chain wallet — withdrawals move its balance
> and calls hold part of it in escrow. In parallel those shift under each other
> mid-assertion.

> **Auto-blur is optional.** `POST /api/posts` with `autoBlur=false` publishes an
> upload directly — Replicate is only needed for the auto-blur pipeline, not to
> create posts.

E2E suites **skip themselves** when their prerequisites are missing (no dev
server running), so `npm test` stays green anywhere.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run wallet:setup` | Opt the platform account in to USDC + report its ALGO gas budget |
| `npm run x402:buy` | An x402 client that buys a post with real USDC (`--list` to browse) |
| `npm run mainnet:preflight` | Read-only gate: everything that must be true before real money |
| `npm run keys:rotate` | Re-encrypt custodial wallet keys onto a new key version |
| `npm run db:generate` / `db:migrate` | Versioned migrations — the production path |
| `npm run db:baseline` | One-off: adopt migrations on a DB built with `db:push` |
| `npm run db:push` / `db:studio` | Schema push (**dev only**) / studio |
| `npm run seed` | Seed demo creator, posts, unlocks, DMs |

### Moderation

Anyone can report a post — no account required, because demanding a login to
report abuse suppresses exactly the reports that matter most. Operators read the
queue and act on it with a bearer token (`MODERATION_SECRET`, which fails closed).

```
POST /api/reports                     { postId, reason, detail }   public
GET  /api/moderation/reports          Authorization: Bearer …      operator
PATCH /api/moderation/reports/{id}    { action: takedown|dismiss|reviewing }
```

A takedown stamps `posts.taken_down_at`, which **every** post read path filters
on, so the content stops being served from the feed, the in-app unlock and the
x402 API at once. The row is kept rather than deleted: the decision stays
auditable and the creator can't undo it by toggling `isPublished`.

#### Automated scanning

Uploads are scanned before they can be served. `lib/moderation/scan.ts` is the
seam — implement `ScanProvider`, set `CONTENT_SCAN_PROVIDER`, done. A Hive
integration is included but has never been run against the live service (no
account), so verify its response shape before trusting it.

The safety property is the default: **flagged AND scanner-error both quarantine**.
A scanner that is down, rate-limited or misconfigured withholds content — it can
never mean "publish anyway". Quarantined posts are excluded by every read path
and auto-file a report, so a human sees them.

`CONTENT_SCAN_PROVIDER=none` (the default) publishes everything unexamined. It
exists so local dev needs no vendor account; `mainnet:preflight` blocks on it.

> **Still not policy.** §2257 age/consent records and a registered DMCA agent are
> legal processes, and real age verification (UK OSA, several US states) needs an
> ID/estimation vendor — the 18+ gate here is a self-attestation and says so. The
> code seams exist; the contracts and the process do not come from a repo.

### Rotating the custodial encryption key

`CUSTODIAL_KEY_ENCRYPTION_SECRET` encrypts every user's wallet key — it *is* the
money. Each wallet records which key version sealed it, so the secret can be
rotated without a flag-day re-encrypt:

```bash
# 1. new key -> CUSTODIAL_KEY_ENCRYPTION_SECRET_V2 (keep the old one readable!)
# 2. CUSTODIAL_KEY_VERSION=2
npm run keys:rotate -- --dry-run
npm run keys:rotate
# 3. once every wallet reports v2, retire the old secret
```

Each row is re-sealed and immediately verified — the re-encrypted key must still
derive to the same Algorand address — and any wallet that fails is reported and
left untouched rather than overwritten. Getting this wrong loses a user's funds,
so the bias is always toward not writing.

### Database migrations

The schema was originally built with `db:push`, which diffs against the live
database and **will drop columns to match** — one of those tables holds the
encrypted keys to users' custodial wallets, so pointing it at production is a way
to destroy real money. The project is now baselined onto versioned migrations:

```bash
npm run db:generate    # write a migration from schema.ts
npm run db:migrate     # apply it — the production path
npm run db:push        # dev only
```

`drizzle/_archive/` holds the pre-baseline history: it was never actually applied
(the `__drizzle_migrations` table didn't exist), its journal was missing two
entries, two files collided on `0007`, and three snapshots were absent.

## Safety and compliance at a glance

| Concern | State |
| --- | --- |
| Reporting | Built — a report control on every post, no account needed |
| Moderation console | Built — `/moderation` (operator secret), reports + record review |
| Takedown | Built — removes content from every read path, verified |
| §2257 submission | Built — `/records`; publishing unblocks only on operator verification |
| Automated scanning | **Seam built**, off by default. `CONTENT_SCAN_PROVIDER=hive` + key to enable |
| §2257 records | **Modelled + enforced**, off by default (`REQUIRE_2257_RECORDS`) |
| DMCA agent / records custodian | **Published from config** — unset shows "not configured" |
| Age gate | Self-attestation only — **not** age verification |
| Real age verification | Not built — needs an ID/estimation vendor |

`npm run mainnet:preflight` blocks on the ones that matter. What no repo can
supply: the vendor contracts, a named custodian, a registered DMCA agent, and a
Terms/Privacy reviewed by a lawyer for your jurisdiction.

## Notes

- Runs on Algorand **TestNet** by default; set `NEXT_PUBLIC_ALGO_NETWORK=mainnet`
  for real USDC (and leave `ALGOD_SERVER` unset so the network switch applies).
- `users.wallet_address` is a synthetic internal id (`0x…`), not an on-chain
  address; the real payment wallet is `custodial_wallets.address`.
- Keep `DEPLOYER_MNEMONIC`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `CUSTODIAL_KEY_ENCRYPTION_SECRET` secret (they live only in `.env.local`).
