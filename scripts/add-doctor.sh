#!/bin/bash
# scripts/add-doctor.sh - إضافة طبيب جديد للعيادة
set -euo pipefail

CLINIC_ID=$1
FULL_NAME=$2
SPECIALTY=${3:-"عام"}
PHONE=${4:-""}

if [ -z "$CLINIC_ID" ] || [ -z "$FULL_NAME" ]; then
  echo "Usage: $0 <clinic_id> <full_name> [specialty] [phone]"
  echo "Example: $0 test_clinic 'د. أحمد العتيبي' 'باطنية' '+966501234567'"
  exit 1
fi

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
INSERT INTO doctors (clinic_id, full_name, specialty, phone, is_active)
VALUES ('$CLINIC_ID', '$FULL_NAME', '$SPECIALTY', '$PHONE', TRUE)
RETURNING id, full_name;
SQL

echo "✅ Doctor added to $CLINIC_ID"
echo ""
echo "⚠️  Next: Add working hours with add-doctor-schedule.sh"