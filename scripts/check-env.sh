#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
fi

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

require_hex_secret() {
  local key="$1"
  local min_length="$2"
  local value
  value="$(env_value "$key")"
  if [[ ${#value} -lt "$min_length" || ! "$value" =~ ^[[:xdigit:]]+$ ]]; then
    echo "$key must be a unique hexadecimal secret of at least ${min_length} characters." >&2
    return 1
  fi
}

require_token() {
  local key="$1"
  local min_length="$2"
  local value
  value="$(env_value "$key")"
  if [[ ${#value} -lt "$min_length" || "$value" =~ (REPLACE|CHANGE_ME|change-me|example|test_) ]]; then
    echo "$key is missing, too short, or still contains a placeholder." >&2
    return 1
  fi
}

require_hex_secret POSTGRES_PASSWORD 64
require_hex_secret REDIS_PASSWORD 64
require_hex_secret SAHEL_APP_PASSWORD 64
require_hex_secret POSTGRES_EXPORTER_PASSWORD 64
require_hex_secret JWT_SECRET 64
require_hex_secret INTEGRATION_ENCRYPTION_KEY 64
require_token META_APP_SECRET 32
require_token META_VERIFY_TOKEN 32
require_token GRAFANA_ADMIN_PASSWORD 20

echo "Environment validation passed. Secret values were not printed."