# Mainnet proof pools

The app runs on devnet, where anyone can try it for free with the built-in
faucet. Meteora's DBC program is the same program on both clusters
(`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`), so every devnet pool is a
real DBC pool. This runbook adds what devnet cannot give: pool addresses on
mainnet that a judge can open on Solscan and on Meteora's own site.

Nothing here runs by itself. Every command spends real SOL only when you add
`--yes`, and only from a key made for this purpose.

## Cost

Measured on devnet with the same transactions: a launch is **0.0266 SOL**, almost
all of it rent for the config, pool, mint and vaults. A mainnet run adds a
priority fee of about 0.00002 SOL per transaction.

| What | SOL |
|---|---|
| One pool | ~0.027 |
| All four presets | ~0.11 |
| One small buy per pool, so each has a mainnet trade | + what you choose to spend |
| **Suggested funding** | **0.15** |

## 1. The key

A mainnet run never uses the devnet launcher. It generates its own key on first
use, at `.juno/mainnet-launcher.json` (ignored by git, mode 600). The first run
without funds stops and prints the address to fund:

```bash
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta NEXT_PUBLIC_SOLANA_RPC='<your mainnet RPC>' npx dotenv -e .env.local -- npx tsx scripts/juno-launch.ts --preset thin-name --quote usdc --initial 10000 --migration 250000
```

Send about 0.15 SOL to the printed address from your own wallet. Use
`--keypair <path>` to launch from a key you already have instead.

## 2. The four pools

Same caps for the three equity shapes, so they compare like for like with the
table in `JUNO.md`; `tight-nav` over a 1.5x range, since it refuses anything
wider than 3x. All quoted in mainnet USDC except `content`, which uses SOL the
way a post does.

```bash
export NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
export NEXT_PUBLIC_SOLANA_RPC='<your mainnet RPC>'
L="npx dotenv -e .env.local -- npx tsx scripts/juno-launch.ts"

$L --preset content   --quote sol  --name "Juno Content"  --symbol JUNOC  --initial 50  --migration 1250   --yes
$L --preset thin-name --quote usdc --name "Juno Thin Name" --symbol JUNOTN --initial 10000 --migration 250000 --yes
$L --preset ipo-book  --quote usdc --name "Juno IPO Book"  --symbol JUNOIB --initial 10000 --migration 250000 --yes
$L --preset tight-nav --quote usdc --name "Juno Tight NAV" --symbol JUNOTV --initial 10000 --migration 15000  --yes
```

Each run prints the pool, the mint, both transactions and a link to
`app.meteora.ag/dbc/<pool>`. Caps are in the quote token: 50 → 1,250 SOL for
`content`, $10k → $250k for the others. No first buy is made, so the caps cost
nothing. They only set where the curve starts and where it graduates.

## 3. One real trade (optional)

A pool with a mainnet swap in its history is stronger proof than an empty one.
`content` is quoted in SOL, so the launcher can buy it without holding USDC:

```bash
npx dotenv -e .env.local -- npx tsx scripts/juno-trade.ts --mint <JUNOC mint> --amount 0.01 --yes
```

## 4. Record them

Put the four pool addresses and the trade signature in the README's
"On mainnet" section. The app itself stays on devnet: its registry is scoped to
a cluster, so mainnet pools stay out of the devnet feed and the two never mix.
