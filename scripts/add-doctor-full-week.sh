#!/bin/bash
# scripts/add-doctor-full-week.sh - إضافة طبيب بجدول كامل
set -euo pipefail

CLINIC_ID=$1
FULL_NAME=$2
SPECIALTY=${3:-"عام"}
START_TIME=${4:-"09:00"}
END_TIME=${5:-"17:00"}

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
DO \$\$
DECLARE
  new_doctor_id INT;
  day_num INT;
BEGIN
  -- أضف الطبيب
  INSERT INTO doctors (clinic_id, full_name, specialty, is_active)
  VALUES ('$CLINIC_ID', '$FULL_NAME', '$SPECIALTY', TRUE)
  RETURNING id INTO new_doctor_id;

  -- أضف جدول عمل من الأحد (0) إلى الخميس (4)
  FOR day_num IN 0..4 LOOP
    INSERT INTO doctor_schedules
      (doctor_id, clinic_id, day_of_week, start_time, end_time, slot_duration_minutes)
    VALUES
      (new_doctor_id, '$CLINIC_ID', day_num, '$START_TIME', '$END_TIME', 30);
  END LOOP;

  RAISE NOTICE 'Added doctor ID % with schedule %-%', new_doctor_id, '$START_TIME', '$END_TIME';
END \$\$;
SQL

echo "✅ Doctor '$FULL_NAME' added with full week schedule"