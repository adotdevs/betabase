#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/betabase"
cd "$ROOT"

echo "==> Pull latest code"
git pull origin main

echo "==> Backend"
cd "$ROOT/BE"
npm ci --omit=dev
pm2 restart betabase-be 2>/dev/null || pm2 restart all || true

echo "==> Frontend"
cd "$ROOT/FE"
npm ci

if [[ ! -d "$ROOT/FE/public/help" ]]; then
  echo "==> Regenerating help centre"
  node "$ROOT/help-center/rebrand-and-copy.js"
fi

npm run build

if [[ -d "$ROOT/FE/public/help" ]]; then
  mkdir -p "$ROOT/FE/build/help"
  rm -rf "$ROOT/FE/build/help"
  cp -r "$ROOT/FE/public/help" "$ROOT/FE/build/help"
fi

if [[ ! -f "$ROOT/FE/build/help/index.html" ]]; then
  echo "ERROR: FE/build/help/index.html missing after build."
  exit 1
fi

echo "==> Help centre OK ($(find "$ROOT/FE/build/help" -type f | wc -l) files)"
echo "==> Deploy complete"
echo "NOTE: Run once if /help/ 404s: sudo bash FE/deploy/apply-help-nginx-now.sh"
