#!/usr/bin/env bash
# Publishes Balance on Vercel (personal account "pokerush", project "balance"). Usage: bash tools/deploy.sh
# Same pattern as kart-da-galera/risk-profitability: copy only the served files to a folder outside git (Hobby accounts
# block deploys whose commit author is not the owner) and use the personal login kept in a separate global config.
set -euo pipefail
cd "$(dirname "$0")/.."
G="C:/Users/davi_/.vercel-pokerush"
STAGE="$G/balance"           # the folder name is the project name on the first deploy
mkdir -p "$STAGE"
find "$STAGE" -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +
cp -r index.html style.css js fonts api package.json vercel.json "$STAGE"/
[ -d art ] && cp -r art "$STAGE"/
[ -f package-lock.json ] && cp package-lock.json "$STAGE"/
if [ -f .vercel/project.json ]; then mkdir -p "$STAGE/.vercel" && cp .vercel/project.json "$STAGE/.vercel/"; fi
ROOT="$PWD"
cd "$STAGE"
code=0; out=$(vercel deploy --prod --yes --scope pokerush --global-config "$G" 2>&1) || code=$?
echo "$out"
cd "$ROOT"
if [ -f "$STAGE/.vercel/project.json" ]; then mkdir -p .vercel && cp "$STAGE/.vercel/project.json" .vercel/; fi
url=$(echo "$out" | grep -o 'https://balance-[a-z0-9-]*\.vercel\.app' | head -n 1 || true)
if [ $code -eq 0 ]; then echo "$(date +%F_%T) ${url:-?}" >> tools/publicacoes.log; fi
exit $code
