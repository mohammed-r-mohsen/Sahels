#!/bin/bash
# scripts/restore.sh - استعادة نسخة
set -euo pipefail

FILE=$1
if [ ! -f "$FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

read -rp "⚠️  This will OVERWRITE the current database. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then exit 0; fi

gunzip -c "$FILE" | docker compose exec -T postgres psql -U sahels -d sahels
echo "✅ Restored from $FILE"