#!/usr/bin/env bash
# Idempotent nginx setup for /help/ static files on betabase.pro
# Run on VPS: sudo bash FE/deploy/setup-help-nginx.sh

set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/var/www/betabase/FE/build}"
SITE="/etc/nginx/sites-enabled/betabase-fe"
MARKER="betabase-help-static"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx not installed."
  exit 1
fi

if [[ ! -f "${SITE}" ]]; then
  echo "ERROR: ${SITE} not found"
  exit 1
fi

echo "==> Remove backup files from sites-enabled"
rm -f /etc/nginx/sites-enabled/betabase-fe.bak.*
rm -f /etc/nginx/sites-enabled/betabase-fe.repair.*

echo "==> Strip old help config from ${SITE}"
cp "${SITE}" "${SITE}.repair.$(date +%s)"
sed -i '/betabase-help\.conf/d' "${SITE}"

awk -v marker="${MARKER}" '
  BEGIN { skip=0 }
  $0 ~ marker { skip=1; next }
  skip && /location \^~ \/help\// { next }
  skip && /location = \/help/ { next }
  skip && /alias .*\/help\// { next }
  skip && /index index\.html;/ { next }
  skip && /return 301 \/help\// { next }
  skip && /^[[:space:]]*}[[:space:]]*$/ { skip=0; next }
  { print }
' "${SITE}" > "${SITE}.tmp"
mv "${SITE}.tmp" "${SITE}"

echo "==> Insert help location once per server block"
awk -v marker="${MARKER}" -v root="${BUILD_ROOT}" '
  BEGIN { in_server=0; inserted=0; has_marker=0 }
  /server[[:space:]]*\{/ {
    in_server=1
    inserted=0
    has_marker=0
    print
    next
  }
  in_server && $0 ~ marker { has_marker=1; print; next }
  in_server && /location[[:space:]]+\// && inserted==0 {
    if (!has_marker) {
      print "    # " marker
      print "    location ^~ /help/ {"
      print "        alias " root "/help/;"
      print "        index index.html;"
      print "    }"
    }
    inserted=1
  }
  /^[[:space:]]*\}[[:space:]]*$/ {
    if (in_server) {
      in_server=0
      inserted=0
      has_marker=0
    }
  }
  { print }
' "${SITE}" > "${SITE}.tmp"
mv "${SITE}.tmp" "${SITE}"

rm -f /etc/nginx/snippets/betabase-help.conf 2>/dev/null || true

if [[ ! -f "${BUILD_ROOT}/help/index.html" ]]; then
  echo "WARNING: ${BUILD_ROOT}/help/index.html missing — run deploy.sh first"
fi

echo "==> Test and reload nginx"
if nginx -t; then
  systemctl reload nginx
  echo "OK — nginx reloaded"
else
  echo "ERROR: nginx config invalid — restore backup from ${SITE}.repair.* if needed"
  exit 1
fi
