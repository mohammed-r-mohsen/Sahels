#!/bin/bash
# scripts/backup.sh - نسخة احتياطية
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/sahels/backups}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/sahels_$(date +%Y%m%d_%H%M%S).sql"

docker compose exec -T postgres pg_dump -U sahels sahels > "$FILE"
gzip "$FILE"
echo "✅ Backup: ${FILE}.gz ($(du -h ${FILE}.gz | cut -f1))"

# احتفظ بآخر 30 نسخة
find "$BACKUP_DIR" -name "sahels_*.sql.gz" -mtime +30 -delete
echo "🧹 Cleaned backups older than 30 days"