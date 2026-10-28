#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <backup_file.dump|backup_file.sql.gz>" >&2
  exit 2
fi

read -r -p "This will replace database objects in the current database. Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 0
fi

case "$FILE" in
  *.dump)
    if [[ -f "${FILE}.sha256" ]]; then
      sha256sum --check "${FILE}.sha256"
    fi
    docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-acl -U sahels -d sahels < "$FILE"
    ;;
  *.sql.gz)
    gzip --test "$FILE"
    gunzip -c "$FILE" | docker compose exec -T postgres psql -U sahels -d sahels
    ;;
  *)
    echo "Unsupported backup format: $FILE" >&2
    exit 2
    ;;
esac

echo "Restore completed from $FILE"