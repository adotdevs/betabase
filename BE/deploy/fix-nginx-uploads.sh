#!/usr/bin/env bash
# Fix 413 Content Too Large on Hostinger VPS (Ubuntu + nginx)
# Run on the server: sudo bash fix-nginx-uploads.sh

set -euo pipefail

echo "==> Betabase upload limit fix (nginx)"

if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx not found. If you use Apache/OpenLiteSpeed, see nginx-upload.conf.example"
  exit 1
fi

SNIPPET="/etc/nginx/conf.d/00-betabase-upload-limits.conf"
echo "==> Writing global upload limits to ${SNIPPET}"
cat > "${SNIPPET}" <<'EOF'
# Betabase — allow file uploads (KYC, tickets, CRM). Default nginx limit is 1m.
client_max_body_size 55m;
client_body_timeout 120s;
client_body_buffer_size 128k;
proxy_read_timeout 120s;
proxy_send_timeout 120s;
EOF

patch_site() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if grep -q "client_max_body_size" "$file"; then
    echo "    already has client_max_body_size: $file"
    sed -i 's/client_max_body_size[^;]*;/client_max_body_size 55m;/g' "$file"
  else
    echo "    adding client_max_body_size to: $file"
    sed -i '/server_name[^;]*betabase\.pro[^;]*;/a\    client_max_body_size 55m;\n    client_body_timeout 120s;' "$file" 2>/dev/null || \
    sed -i '/server {/a\    client_max_body_size 55m;\n    client_body_timeout 120s;' "$file"
  fi
}

echo "==> Patching site configs in /etc/nginx/sites-enabled/"
shopt -s nullglob
for f in /etc/nginx/sites-enabled/*; do
  if grep -qE 'betabase|api\.|proxy_pass' "$f" 2>/dev/null; then
    patch_site "$f"
  fi
done

# Certbot SSL configs often live here
for f in /etc/nginx/sites-available/*; do
  if grep -qE 'betabase|api\.betabase' "$f" 2>/dev/null; then
    patch_site "$f"
  fi
done

echo "==> Testing nginx config"
nginx -t

echo "==> Reloading nginx"
systemctl reload nginx

echo ""
echo "DONE. Upload limit is now 55MB."
echo "Test: upload a small image on KYC or ticket reply."
echo "If still 413, check Cloudflare (orange cloud) or run: grep -r client_max_body_size /etc/nginx/"
