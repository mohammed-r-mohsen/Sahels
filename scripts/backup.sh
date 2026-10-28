#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/opt/sahels/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/sahels_${STAMP}.dump"
TEMP_FILE="${FILE}.partial"

notify_failure() {
	local status=$?
	rm -f "$TEMP_FILE"
	if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
		curl --fail --silent --show-error --max-time 5 \
			-H 'Content-Type: application/json' \
			-d '{"text":"Sahels PostgreSQL backup failed; inspect the backup job logs."}' \
			"$ALERT_WEBHOOK_URL" >/dev/null || true
	fi
	exit "$status"
}
trap notify_failure ERR

docker compose exec -T postgres pg_dump --format=custom --no-owner --no-acl -U sahels sahels > "$TEMP_FILE"
test -s "$TEMP_FILE"
docker compose exec -T postgres pg_restore --list - < "$TEMP_FILE" >/dev/null
mv "$TEMP_FILE" "$FILE"
sha256sum "$FILE" > "${FILE}.sha256"
printf 'Backup verified: %s (%s)\n' "$FILE" "$(du -h "$FILE" | cut -f1)"

find "$BACKUP_DIR" -type f -name 'sahels_*.dump*' -mtime +30 -delete