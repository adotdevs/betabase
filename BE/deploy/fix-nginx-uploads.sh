#!/usr/bin/env bash
# VPS-wide nginx upload limit (all sites / all services on this server)
#
# Usage:
#   sudo bash fix-nginx-uploads.sh           # default 100m
#   sudo LIMIT=200m bash fix-nginx-uploads.sh
#
# What it does:
#   1. Sets global limits in /etc/nginx/conf.d/ (applies to every site)
#   2. Patches every file in sites-enabled + sites-available
#   3. Ensures nginx.conf http {} includes conf.d (Ubuntu default)

set -euo pipefail

LIMIT="${LIMIT:-100m}"

echo "==> VPS-wide nginx upload limit fix (limit=${LIMIT})"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx not installed."
  echo "For Apache see: BE/deploy/nginx-upload.conf.example"
  exit 1
fi

GLOBAL_SNIPPET="/etc/nginx/conf.d/00-vps-upload-limits.conf"
echo "==> [1/4] Global limits for ALL sites -> ${GLOBAL_SNIPPET}"
cat > "${GLOBAL_SNIPPET}" <<EOF
# VPS-wide upload limits (all nginx server blocks inherit from http {})
# Set by betabase BE/deploy/fix-nginx-uploads.sh
client_max_body_size ${LIMIT};
client_body_timeout 300s;
client_body_buffer_size 256k;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 60s;
EOF

# Optional: also set inside nginx.conf http {} if missing (belt and suspenders)
NGINX_MAIN="/etc/nginx/nginx.conf"
if [[ -f "$NGINX_MAIN" ]] && ! grep -q "client_max_body_size" "$NGINX_MAIN"; then
  echo "==> [2/4] Adding limit to ${NGINX_MAIN} http {} block"
  sed -i "/^[[:space:]]*http[[:space:]]*{/a\\    client_max_body_size ${LIMIT};" "$NGINX_MAIN" || true
else
  echo "==> [2/4] Skipping nginx.conf (already has limit or conf.d handles it)"
fi

patch_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  # Skip snippets we own
  [[ "$file" == *"00-vps-upload-limits.conf"* ]] && return 0

  if grep -q "client_max_body_size" "$file"; then
    sed -i "s/client_max_body_size[^;]*;/client_max_body_size ${LIMIT};/g" "$file"
    echo "    updated: $file"
  elif grep -q "server[[:space:]]*{" "$file" 2>/dev/null; then
    sed -i "0,/server[[:space:]]*{/{s/server[[:space:]]*{/server {\n    client_max_body_size ${LIMIT};\n    client_body_timeout 300s;/}" "$file"
    echo "    added to server block: $file"
  fi
}

echo "==> [3/4] Patching ALL site configs (every service on this VPS)"
shopt -s nullglob
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*; do
  [[ -f "$f" ]] || continue
  patch_file "$f"
done

echo "==> [4/4] Testing and reloading nginx"
nginx -t
systemctl reload nginx

echo ""
echo "=============================================="
echo "DONE — VPS-wide upload limit is now ${LIMIT}"
echo "=============================================="
echo ""
echo "Verify:"
echo "  grep -r client_max_body_size /etc/nginx/conf.d/"
echo "  sudo nginx -T 2>/dev/null | grep client_max_body_size | head"
echo ""
echo "Per-site override (optional, in any server {} block):"
echo "  client_max_body_size 500m;   # only if one app needs more"
echo ""
echo "Restart app backends after this (Node, PHP, etc.):"
echo "  pm2 restart all"
