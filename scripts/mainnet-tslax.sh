#!/usr/bin/env bash
# One stock-paired Meteora curve on mainnet: a Juno pool priced in TSLAx
# (tokenized Tesla). Uses Meteora's DBC token badge for the xStock mint.
#
#   bash scripts/mainnet-tslax.sh
#
# Spends ~0.027 SOL from .juno/mainnet-launcher.json (account rent + fees).
# The curve opens at 26 TSLAx FDV (~$9.6k) and graduates at 39 TSLAx (~$14.4k):
# a tight-nav range, 1.5x, so it trades like a spread around its opening price.
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
export NEXT_PUBLIC_SOLANA_RPC="${RPC:-https://api.mainnet-beta.solana.com}"
KEY=.juno/mainnet-launcher.json
echo "Launcher: $(solana-keygen pubkey "$KEY")"
echo "Balance:  $(solana balance -u "$NEXT_PUBLIC_SOLANA_RPC" "$(solana-keygen pubkey "$KEY")")"
echo "This launches one TSLAx-quoted pool on MAINNET with real SOL (~0.027)."
read -r -p "Type yes to continue: " answer
[ "$answer" = "yes" ] || { echo "Stopped."; exit 1; }
npx dotenv -e .env.local -- npx tsx scripts/juno-launch.ts \
  --preset tight-nav --quote tslax --name "Juno Tesla Curve" --symbol JUNOTSLA \
  --description "A Juno tight-NAV curve priced in TSLAx, tokenized Tesla. Stock-paired on Meteora DBC." \
  --initial 26 --migration 39 --yes 2>&1 | tee .juno/mainnet-tslax.log
echo -e "\nDone. Addresses are in .juno/mainnet-tslax.log — tell Claude."
