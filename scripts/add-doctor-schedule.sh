#!/bin/bash
# scripts/add-doctor-schedule.sh - إضافة جدول عمل لطبيب
set -euo pipefail

DOCTOR_ID=$1
CLINIC_ID=$2
DAY_OF_WEEK=$3       # 0=الأحد، 6=السبت
START_TIME=$4        # HH:MM
END_TIME=$5          # HH:MM
SLOT_MINUTES=${6:-30}

if [ -z "$DOCTOR_ID" ] || [ -z "$DAY_OF_WEEK" ]; then
  echo "Usage: $0 <doctor_id> <clinic_id> <day_of_week> <start_time> <end_time> [slot_minutes]"
  echo "Example: $0 1 test_clinic 0 09:00 17:00 30"
  exit 1
fi

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
INSERT INTO doctor_schedules
  (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_duration_minutes)
VALUES
  ($DOCTOR_ID, '$CLINIC_ID', $DAY_OF_WEEK, '$START_TIME', '$END_TIME', $SLOT_MINUTES)
RETURNING id;
SQL

echo "✅ Schedule added for doctor $DOCTOR_ID on day $DAY_OF_WEEK"