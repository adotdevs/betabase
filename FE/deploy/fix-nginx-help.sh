#!/usr/bin/env bash
# Ensure /help/ serves static files on www.betabase.pro
#
# Usage:
#   cd /var/www/betabase && git pull
#   sudo bash FE/deploy/fix-nginx-help.sh

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
    try_files \$uri \$uri/ =404;
}
EOF

patch_site_file() {
  local site_file="$1"
  local patched=0

  if grep -q "${MARKER}" "${site_file}"; then
    echo "Already patched: ${site_file}"
    return 0
  fi

  cp "${site_file}" "${site_file}.bak.$(date +%Y%m%d%H%M%S)"

  awk -v snippet="    include ${SNIPPET};" -v marker="${MARKER}" '
    BEGIN { in_server=0; inserted=0 }
    /server\s*\{/ { in_server=1 }
    in_server && /server_name/ && /betabase\.pro/ && !/api\.betabase\.pro/ { in_frontend=1 }
    in_server && in_frontend && /location \// && inserted==0 {
      print snippet
      inserted=1
    }
    /^\}/ {
      if (in_server) { in_server=0; in_frontend=0 }
    }
    { print }
  ' "${site_file}" > "${site_file}.tmp"

  if grep -q "${MARKER}" "${site_file}.tmp"; then
    mv "${site_file}.tmp" "${site_file}"
    echo "Patched: ${site_file}"
    patched=1
  else
    rm -f "${site_file}.tmp"
    echo "WARN: Could not patch ${site_file} automatically"
  fi

  return 0
}

found=0
while IFS= read -r site_file; do
  [[ -f "${site_file}" ]] || continue
  if grep -q "server_name.*betabase\.pro" "${site_file}" && ! grep -q "api\.betabase\.pro" "${site_file}"; then
    patch_site_file "${site_file}"
    found=1
  fi
done < <(find /etc/nginx/sites-enabled /etc/nginx/sites-available -maxdepth 1 -type f 2>/dev/null | sort -u)

if [[ "${found}" -eq 0 ]]; then
  echo "ERROR: No frontend nginx vhost found for betabase.pro"
  echo "Copy FE/deploy/nginx-www.betabase.pro.conf manually."
  exit 1
fi

if [[ ! -f "${BUILD_ROOT}/help/index.html" ]]; then
  echo "WARNING: ${BUILD_ROOT}/help/index.html missing"
  echo "Run: bash /var/www/betabase/deploy.sh"
fi

nginx -t
systemctl reload nginx
echo "Done. Test https://www.betabase.pro/help/index.html"
