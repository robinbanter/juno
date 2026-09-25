#!/usr/bin/env bash
# Launch Juno's four mainnet proof pools and make one small buy, in one go.
#
#   bash scripts/mainnet-proof.sh            # uses the public mainnet RPC
#   RPC='https://mainnet.helius-rpc.com/?api-key=…' bash scripts/mainnet-proof.sh
#
# Spends real SOL from .juno/mainnet-launcher.json: ~0.027 per pool plus a
# 0.01 SOL buy. Everything it prints is also written to .juno/<cluster>-proof.log.
set -euo pipefail
cd "$(dirname "$0")/.."

# CLUSTER=devnet runs the same thing on devnet, with the devnet launcher —
# how this script itself was tested.
export NEXT_PUBLIC_SOLANA_CLUSTER="${CLUSTER:-mainnet-beta}"
DEFAULT_RPC=https://api.mainnet-beta.solana.com
KEY=.juno/mainnet-launcher.json
if [ "$NEXT_PUBLIC_SOLANA_CLUSTER" = devnet ]; then DEFAULT_RPC=https://api.devnet.solana.com; KEY=.juno/launcher.json; fi
export NEXT_PUBLIC_SOLANA_RPC="${RPC:-$DEFAULT_RPC}"
LOG=".juno/${NEXT_PUBLIC_SOLANA_CLUSTER}-proof.log"
RUN="npx dotenv -e .env.local -- npx tsx"

echo "Cluster:  $NEXT_PUBLIC_SOLANA_CLUSTER"
echo "Launcher: $(solana-keygen pubkey "$KEY")"
echo "Balance:  $(solana balance -u "$NEXT_PUBLIC_SOLANA_RPC" "$(solana-keygen pubkey "$KEY")")"
echo "This launches 4 pools and buys 0.01 SOL of one, with real SOL on mainnet."
read -r -p "Type yes to continue: " answer
[ "$answer" = "yes" ] || { echo "Stopped."; exit 1; }

: > "$LOG"
launch() {
  echo -e "\n=== $1" | tee -a "$LOG"
  $RUN scripts/juno-launch.ts --preset "$1" --quote "$2" --name "$3" --symbol "$4" \
    --initial "$5" --migration "$6" --yes 2>&1 | tee -a "$LOG"
}

launch content   sol  "Juno Content"   JUNOC  50    1250
launch thin-name usdc "Juno Thin Name" JUNOTN 10000 250000
launch ipo-book  usdc "Juno IPO Book"  JUNOIB 10000 250000
launch tight-nav usdc "Juno Tight NAV" JUNOTV 10000 15000

# The SOL-quoted pool gets one real trade.
field() { awk -v k="$1" '/=== content/{f=1} f && $1==k {print $2; exit}' "$LOG" | sed -E 's#.*/(token|account)/([^?]+).*#\2#'; }
MINT=$(field mint); POOL=$(field pool)
echo -e "\n=== buy 0.01 SOL of JUNOC (mint $MINT, pool $POOL)" | tee -a "$LOG"
$RUN scripts/juno-trade.ts --mint "$MINT" --pool "$POOL" --amount 0.01 --yes 2>&1 | tee -a "$LOG"

echo -e "\nDone. Addresses are in $LOG — send that file (or paste it) to Claude."
