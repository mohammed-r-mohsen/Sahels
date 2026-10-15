#!/bin/bash
# scripts/clinic-feature.sh - إدارة ميزات العيادة
set -euo pipefail

ACTION=$1
CID=$2
FEATURE=$3

if [ -z "$FEATURE" ]; then
  echo "Usage: $0 enable|disable <clinic_id> <feature>"
  echo "Features: whatsapp, instagram, reception, deposit, reminder_3h, waiting_list, flow_booking, reports"
  exit 1
fi

case "$ACTION" in
  enable)  VAL=TRUE ;;
  disable) VAL=FALSE ;;
  *) echo "Usage: $0 enable|disable <clinic_id> <feature>"; exit 1 ;;
esac

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
INSERT INTO clinic_features (clinic_id, feature, enabled)
VALUES ('$CID', '$FEATURE', $VAL)
ON CONFLICT (clinic_id, feature) DO UPDATE SET enabled = $VAL, updated_at=NOW();
SQL

# إبطال الـ cache
curl -s -X POST http://localhost:3000/api/admin/invalidate-cache \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN:-test_admin_token}" \
  -d "{\"clinic_id\":\"$CID\"}" > /dev/null || true

echo "✅ Feature '$FEATURE' for '$CID' set to $VAL"