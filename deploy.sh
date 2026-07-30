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
npm run build

if [[ ! -f "$ROOT/FE/build/help/index.html" ]]; then
  echo "ERROR: FE/build/help/index.html missing after build."
  echo "Ensure FE/public/help/ is committed, or run: node help-center/rebrand-and-copy.js"
  exit 1
fi

echo "==> Help centre OK ($(find "$ROOT/FE/build/help" -type f | wc -l) files)"

if [[ -f "$ROOT/FE/deploy/fix-nginx-help.sh" ]]; then
  echo "==> Nginx help route"
  sudo bash "$ROOT/FE/deploy/fix-nginx-help.sh" || echo "WARN: nginx help snippet skipped (run manually with sudo)"
fi

echo "==> Deploy complete"
