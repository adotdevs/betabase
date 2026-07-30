#!/usr/bin/env bash
# Idempotent nginx setup for /help/ static files on betabase.pro
# Run on VPS: sudo bash FE/deploy/setup-help-nginx.sh

set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/var/www/betabase/FE/build}"
SNIPPET="/etc/nginx/snippets/betabase-help.conf"
SITE="/etc/nginx/sites-enabled/betabase-fe"
MARKER="betabase-help-static"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx not installed."
  exit 1
fi

echo "==> Remove backup files from sites-enabled (nginx loads all of them)"
rm -f /etc/nginx/sites-enabled/betabase-fe.bak.*

echo "==> Write help snippet"
mkdir -p /etc/nginx/snippets
cat > "${SNIPPET}" <<EOF
# ${MARKER}
location ^~ /help/ {
    alias ${BUILD_ROOT}/help/;
    index index.html;
}
location = /help {
    return 301 /help/;
}
EOF

if [[ ! -f "${SITE}" ]]; then
  echo "ERROR: ${SITE} not found"
  exit 1
fi

echo "==> Clean old help includes from ${SITE}"
cp "${SITE}" "${SITE}.repair.$(date +%s)"
sed -i '/betabase-help\.conf/d' "${SITE}"

echo "==> Insert one include per server block"
awk -v snippet="    include ${SNIPPET};" -v marker="${MARKER}" '
  BEGIN { in_server=0; inserted=0 }
  /server\s*\{/ { in_server=1; inserted=0 }
  in_server && /location \// && inserted==0 {
    print snippet
    inserted=1
  }
  { print }
' "${SITE}" > "${SITE}.tmp"
mv "${SITE}.tmp" "${SITE}"

if [[ ! -f "${BUILD_ROOT}/help/index.html" ]]; then
  echo "WARNING: ${BUILD_ROOT}/help/index.html missing — run deploy.sh first"
fi

echo "==> Test and reload nginx"
nginx -t
systemctl reload nginx
echo "OK — test https://www.betabase.pro/help/"
