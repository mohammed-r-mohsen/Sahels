#!/bin/bash
# scripts/remove-clinic.sh - حذف عيادة
set -euo pipefail

CID=$1
if [ -z "$CID" ]; then
  echo "Usage: $0 <clinic_id>"
  exit 1
fi

read -rp "⚠️  Are you sure you want to DELETE clinic '$CID' and ALL its data? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
DELETE FROM payments WHERE clinic_id='$CID';
DELETE FROM bookings WHERE clinic_id='$CID';
DELETE FROM consents WHERE clinic_id='$CID';
DELETE FROM waiting_list WHERE clinic_id='$CID';
DELETE FROM access_logs WHERE clinic_id='$CID';
DELETE FROM clinic_features WHERE clinic_id='$CID';
DELETE FROM clinic_deposit_config WHERE clinic_id='$CID';
DELETE FROM clinic_subscriptions WHERE clinic_id='$CID';
DELETE FROM channel_identities WHERE clinic_id='$CID';
DELETE FROM central_clinics WHERE clinic_id='$CID';
DELETE FROM clinics WHERE id='$CID';
SQL

echo "✅ Clinic $CID deleted"