# Launching Norr on MainNet

`npm run mainnet:preflight` is the gate. It refuses to pass while any of the
below is unsatisfied, and it reads the real code rather than a copy of it — the
number it prints is the honest one.

Everything remaining is **money, legal identity, or a vendor account**. None of
it can be written; each item needs a human with a card, a lawyer, or both. They
are listed in the order that unblocks the most.

Run the gate after each step:

```bash
npm run mainnet:preflight
```

---

## 1. A fresh platform key — do this first

The TestNet deployer's mnemonic has been pasted in plaintext, repeatedly. A key
that has been shown to anyone is public forever, so preflight blocks it **by
address**: it cannot be argued with, only replaced.

```bash
npm run wallet:generate
```

Run it yourself. It prints a new address and mnemonic once, keeps no copy, and
writes nothing — you are the only one who ever sees it. Put the mnemonic in a
password manager or secret store *before closing the terminal*; it cannot be
regenerated, and funds sent to an address whose mnemonic you lost are gone.

Set in your production secret store (**not** a file git can see):

- `DEPLOYER_MNEMONIC`
- `DEPLOYER_ADDRESS`

> **Rotate the rest while you are here.** The Neon password, Supabase
> `service_role` key, and Privy secret were also pasted in plaintext. Same rule:
> shown once, public forever.

## 2. Fund it with ALGO

The platform account pays transaction fees and seeds each new custodial wallet's
minimum balance. Empty, nothing settles.

Send ALGO to `DEPLOYER_ADDRESS`. Preflight prints how many wallets the current
balance can seed, so it will tell you if it is thin.

## 3. Opt the account into USDC

USDC is Circle's asset, not one we mint, so the account cannot *receive* revenue
until it opts in. One transaction, and it needs step 2 done first.

```bash
npm run wallet:setup
```

## 4. A content scanner

`CONTENT_SCAN_PROVIDER=none` means no upload can publish: production fails
closed and quarantines everything for review. That is deliberate — CSAM
liability is strict, and there is no "we hadn't wired it up yet" defence — but
it is not a platform.

Get an account with [Hive](https://thehive.ai), Thorn, or PhotoDNA, then:

- `CONTENT_SCAN_PROVIDER=hive`
- `HIVE_API_KEY=…`

> The Hive provider in `lib/moderation/scan.ts` is written against their
> documented sync endpoint but **has never run against the live service**.
> Before trusting it with real uploads, verify the response shape and the
> blocking class names against your dashboard. The seam is the tested part; the
> vendor's contract is not.

## 5. A moderation secret

Without `MODERATION_SECRET`, reports can be filed and nobody can action them —
a queue that only fills up.

```bash
openssl rand -hex 32
```

Set `MODERATION_SECRET` to the output. Anyone holding it can clear flagged
content, so treat it as a credential.

## 6. A registered DMCA agent

§512(c) safe harbour requires an agent registered with the **US Copyright
Office** ([dmca.copyright.gov](https://dmca.copyright.gov)) — a real name and a
monitored address, renewed every three years. Without it, the platform is liable
for user-uploaded infringement.

- `DMCA_AGENT_NAME`
- `DMCA_AGENT_EMAIL`

`/legal/compliance` publishes these. Until they are set, it says so.

## 7. A §2257 records custodian

18 U.S.C. §2257 requires a named custodian, at a physical address, holding
age-and-consent records for every performer, available for inspection.

- `RECORDS_CUSTODIAN_NAME`

Enforcement itself is already on: production defaults `REQUIRE_2257_RECORDS` to
true, so no creator publishes without a verified record. This step is publishing
*who holds them*.

## 8. Point at MainNet

Last, once 1–7 are green — this is the switch that makes the money real.

- `NEXT_PUBLIC_ALGO_NETWORK=mainnet`
- `ALGO_NETWORK=mainnet`

Leave `USDC_ASSET_ID_OVERRIDE` unset. It exists for local forks; setting it on
MainNet points the app at an asset that is not USDC.

---

## Strongly recommended (preflight warns, does not block)

**`ALERT_WEBHOOK_URL`** — without it, a failed settlement or withdrawal reaches
the logs and nobody else. These are the failures where a fan has the media and
the creator has not been paid; they should wake someone.

---

## Before you take real money

Two things preflight cannot check.

**The e2e money suites skip when the fan's wallet is empty** and say so loudly on
stderr. A skipped money test is not a passing money test — fund the wallet and
run them again before believing a green suite.

**Lawyer-review the Terms and the compliance page.** Templates are not advice,
and this is a jurisdictionally hostile category.
