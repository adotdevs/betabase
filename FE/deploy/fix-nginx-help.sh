#!/usr/bin/env bash
# Ensure /help/ serves static files before the React SPA on www.betabase.pro
#
# Usage on VPS:
#   cd /var/www/betabase && git pull
#   sudo bash FE/deploy/fix-nginx-help.sh
#
# Optional:
#   BUILD_ROOT=/var/www/betabase/FE/build sudo bash FE/deploy/fix-nginx-help.sh

set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/var/www/betabase/FE/build}"
SNIPPET="/etc/nginx/snippets/betabase-help.conf"
MARKER="betabase-help-static"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx not installed."
  exit 1
fi

mkdir -p /etc/nginx/snippets
cat > "${SNIPPET}" <<EOF
# ${MARKER}
location ^~ /help/ {
    alias ${BUILD_ROOT}/help/;
    index index.html;
}
EOF

find_site_file() {
  local f
  for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*; do
    [[ -f "$f" ]] || continue
    if grep -q "server_name.*betabase\.pro" "$f" && ! grep -q "api\.betabase\.pro" "$f"; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

SITE_FILE="$(find_site_file || true)"
if [[ -z "${SITE_FILE}" ]]; then
  echo "ERROR: Could not find nginx vhost for www.betabase.pro"
  echo "Add manually from FE/deploy/nginx-www.betabase.pro.conf"
  exit 1
fi

echo "==> Frontend vhost: ${SITE_FILE}"

if grep -q "${MARKER}" "${SITE_FILE}"; then
  echo "==> Help location already configured"
else
  cp "${SITE_FILE}" "${SITE_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  awk -v snippet="include ${SNIPPET};" -v marker="${MARKER}" '
    BEGIN { inserted=0 }
    /location \// && inserted==0 {
      print snippet
      inserted=1
    }
    { print }
  ' "${SITE_FILE}" > "${SITE_FILE}.tmp"
  mv "${SITE_FILE}.tmp" "${SITE_FILE}"
  echo "==> Inserted: include ${SNIPPET};"
fi

if [[ ! -f "${BUILD_ROOT}/help/index.html" ]]; then
  echo "WARNING: ${BUILD_ROOT}/help/index.html not found — run deploy.sh first"
fi

echo "==> Testing nginx..."
nginx -t

echo "==> Reloading nginx..."
systemctl reload nginx

echo "Done. Open https://www.betabase.pro/help/"
