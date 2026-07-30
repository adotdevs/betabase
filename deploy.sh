#!/usr/bin/env bash
set -euo pipefail

ROOT="/var/www/betabase"
cd "$ROOT"

echo "==> Sync latest code"
git fetch origin main
git reset --hard origin/main
# Remove leftover build artifacts so npm run build starts clean
git clean -fd FE/build/

echo "==> Backend"
cd "$ROOT/BE"
npm ci --omit=dev
pm2 restart betabase-be 2>/dev/null || pm2 restart all || true

echo "==> Frontend"
cd "$ROOT/FE"
npm ci

if [[ -d "$ROOT/FE/public/help" ]]; then
  echo "==> Help centre source: $(find "$ROOT/FE/public/help" -type f | wc -l) files"
else
  echo "==> Regenerating help centre"
  node "$ROOT/help-center/rebrand-and-copy.js"
fi

npm run build

mkdir -p "$ROOT/FE/build/help"
rsync -a --delete "$ROOT/FE/public/help/" "$ROOT/FE/build/help/"

if [[ ! -f "$ROOT/FE/build/help/index.html" ]]; then
  echo "ERROR: FE/build/help/index.html missing after build."
  exit 1
fi

echo "==> Help centre OK ($(find "$ROOT/FE/build/help" -type f | wc -l) files)"

if [[ -f "$ROOT/FE/deploy/setup-help-nginx.sh" ]]; then
  echo "==> Nginx help route"
  sudo bash "$ROOT/FE/deploy/setup-help-nginx.sh"
fi

echo "==> Deploy complete"
