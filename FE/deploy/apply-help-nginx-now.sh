#!/usr/bin/env bash
# Quick fix: serve help centre static files (directory index.html support)
# Run on VPS: sudo bash FE/deploy/apply-help-nginx-now.sh

set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/var/www/betabase/FE/build}"
SNIPPET="/etc/nginx/snippets/betabase-help.conf"

mkdir -p /etc/nginx/snippets
cat > "${SNIPPET}" <<EOF
# betabase-help-static
location ^~ /help/ {
    alias ${BUILD_ROOT}/help/;
    index index.html;
}
location = /help {
    return 301 /help/;
}
EOF

echo "Wrote ${SNIPPET}"

for f in /etc/nginx/sites-enabled/*; do
  [[ -f "$f" ]] || continue
  grep -q "betabase\.pro" "$f" || continue
  grep -q "api\.betabase\.pro" "$f" && continue
  grep -q "betabase-help-static" "$f" && { echo "Skip (already): $f"; continue; }

  cp "$f" "${f}.bak.$(date +%s)"
  sed -i "/location \//i\\    include ${SNIPPET};" "$f"
  echo "Patched: $f"
done

nginx -t
systemctl reload nginx
echo "OK — test https://www.betabase.pro/help/"
