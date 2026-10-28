#!/usr/bin/env bash
set -uo pipefail

failures=0

check_http() {
  local name="$1"
  local url="$2"
  if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null; then
    printf 'OK   %s\n' "$name"
  else
    printf 'FAIL %s (%s)\n' "$name" "$url"
    failures=$((failures + 1))
  fi
}

check_http "Web" "http://127.0.0.1:3000/"
check_http "API" "http://127.0.0.1:8080/health"

if docker compose exec -T postgres pg_isready -U sahels -d sahels >/dev/null 2>&1; then
  printf 'OK   PostgreSQL\n'
else
  printf 'FAIL PostgreSQL\n'
  failures=$((failures + 1))
fi

if docker compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' 2>/dev/null | grep -qx PONG; then
  printf 'OK   Redis\n'
else
  printf 'FAIL Redis\n'
  failures=$((failures + 1))
fi

if (( failures > 0 )); then
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 5 \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"Sahels health check failed: ${failures} check(s)\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || printf 'WARN alert webhook delivery failed\n' >&2
  fi
  exit 1
fi

printf 'All production services are healthy.\n'