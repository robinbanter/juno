# Norr — 60-second demo

Pay-per-tap premium content on **Algorand**, settled in **real USDC** via the
**x402** protocol. Runs on TestNet — no real money, nothing to register, just
the working payment loop.

## The one-line pitch

> Every unlock, tip, and metered call is a real on-chain USDC payment. And
> because it speaks x402, an **AI agent with a wallet** can buy the same content
> with no account and no session — pay per request.

That agent angle is the differentiator. Lead with it.

---

## Setup (once, ~2 min)

```bash
npm install
npm run dev          # already on TestNet — no config needed
npm run seed         # demo creators, posts, and threads
```

Get TestNet USDC (asset `10458941`) from Circle's faucet:
<https://faucet.circle.com> → pick **Algorand TestNet**.

---

## The demo — two acts

### Act 1 — a human pays by tapping (90 seconds)

1. Open the app, sign in.
2. **Deposit** → it shows a real custodial Algorand address. Send it a few
   TestNet USDC from the faucet. The balance updates from the chain.
3. Open a creator's feed. Premium posts are blurred behind a real paywall —
   the raw media never leaves private storage.
4. **Tap to unlock.** Watch the balance drop, the media resolve, and — the part
   judges care about — the creator's own wallet gets the USDC **on-chain**. No
   platform float; the money goes straight to the creator.
5. (Optional) Start a **metered call** — it charges per second, escrowing USDC
   as the call runs and settling when it ends.

### Act 2 — an AI agent pays per request (30 seconds, the mic drop)

No browser. No account. Just an agent with a wallet hitting an HTTP endpoint:

```bash
npm run x402:buy -- --list      # what's for sale, as machine-readable x402
npm run x402:buy                # buy the cheapest post — pays real USDC, gets the media
```

What just happened: the agent `GET`s the resource, receives a **402** carrying
signed payment requirements, pays USDC from its own Algorand wallet, and retries
— the facilitator verifies and settles on-chain. Same content, same price, no
human in the loop.

> This is the case the whole web is about to need: agents that pay for what they
> consume, per request, without a credit card or a login.

---

## If a judge asks the hard questions

- **"Is the money real?"** Real USDC on Algorand TestNet — same asset id shape,
  same settlement path as MainNet. Every payment is a verifiable on-chain
  transaction; the settlement receipt comes back in the response.
- **"What stops a double-spend?"** Every spend authorises under a `SELECT … FOR
  UPDATE` row lock, and the database refuses a negative escrow outright. There's
  a test suite that fires an unlock and a withdrawal at the same instant and
  proves exactly one wins. (191 tests: `npm test`.)
- **"Could an agent replay a payment?"** No — a payment is bound to the specific
  post. A $1.50 payment can't unlock a $4.00 post, and a payment can't be
  replayed against itself. Verified live.
- **"Is it production-ready?"** The payment engine is. Going *commercial* needs a
  content scanner and legal registrations (DMCA, §2257) — and the code refuses
  to switch to MainNet until those are set. See [LAUNCH.md](./LAUNCH.md). For a
  demo, TestNet is the whole story.

---

## Architecture, in one breath

Next.js + custodial ed25519 wallets (AES-256-GCM at rest) → real USDC on
Algorand via `@x402/*` and the GoPlausible facilitator → private media behind
short-lived signed URLs → a Postgres ledger that mirrors the chain, with every
spend serialized under a row lock.

`npm run mainnet:preflight` is the gate between "great demo" and "real business."
For this weekend, you want the demo.
