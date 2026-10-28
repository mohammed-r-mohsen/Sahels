#!/usr/bin/env bash
set -euo pipefail

: "${SSH_ALLOW_CIDR:?Set SSH_ALLOW_CIDR to the admin IP/CIDR before enabling UFW}"
SSH_PORT="${SSH_PORT:-22}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl --fail --silent --show-error https://www.cloudflare.com/ips-v4 -o "$tmp_dir/ips-v4"
curl --fail --silent --show-error https://www.cloudflare.com/ips-v6 -o "$tmp_dir/ips-v6"
test -s "$tmp_dir/ips-v4"
test -s "$tmp_dir/ips-v6"

ufw default deny incoming
ufw default allow outgoing
ufw --force delete allow 80/tcp >/dev/null 2>&1 || true
ufw --force delete allow 443/tcp >/dev/null 2>&1 || true
ufw allow from "$SSH_ALLOW_CIDR" to any port "$SSH_PORT" proto tcp

while IFS= read -r network; do
  [[ -z "$network" ]] && continue
  ufw allow from "$network" to any port 80 proto tcp
  ufw allow from "$network" to any port 443 proto tcp
done < "$tmp_dir/ips-v4"

while IFS= read -r network; do
  [[ -z "$network" ]] && continue
  ufw allow from "$network" to any port 80 proto tcp
  ufw allow from "$network" to any port 443 proto tcp
done < "$tmp_dir/ips-v6"

ufw --force enable
ufw status verbose