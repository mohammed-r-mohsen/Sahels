#!/usr/bin/env bash
set -Eeuo pipefail

clinic_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
user_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
doctor_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
email="booking-test-${user_id}@example.invalid"
patient_phone="9${user_id//-/}"

read -r starts_at weekday < <(python3 - <<'PY'
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

local = datetime.combine(
    datetime.now(ZoneInfo("Asia/Riyadh")).date() + timedelta(days=3),
    time(10, 0),
    tzinfo=ZoneInfo("Asia/Riyadh"),
)
print(local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), (local.weekday() + 1) % 7)
PY
)

if [[ -z "${JWT_SECRET:-}" ]]; then
  JWT_SECRET="$(docker compose exec -T api printenv JWT_SECRET)"
fi

temp_dir="$(mktemp -d)"
cleanup() {
  docker compose exec -T postgres psql -X -U sahels -d sahels \
    -c "DELETE FROM clinics WHERE id = '${clinic_id}'" >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
}
trap cleanup EXIT

docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U sahels -d sahels \
  -v clinic_id="$clinic_id" \
  -v user_id="$user_id" \
  -v email="$email" \
  -v doctor_id="$doctor_id" \
  -v weekday="$weekday" <<'SQL'
INSERT INTO clinics (id, name, slug, subscription_status)
VALUES (:'clinic_id', 'Booking API Test', 'booking-api-' || left(:'clinic_id', 8), 'active');

INSERT INTO users (id, clinic_id, email, password_hash, full_name, role, is_active)
VALUES (:'user_id', :'clinic_id', :'email', 'test-hash', 'Booking API Test Doctor', 'doctor', TRUE);

INSERT INTO doctors (id, clinic_id, user_id, full_name, slot_minutes, capacity_per_slot, is_active)
VALUES (:'doctor_id', :'clinic_id', :'user_id', 'Booking API Test Doctor', 30, 1, TRUE);

INSERT INTO doctor_schedules (clinic_id, doctor_id, weekday, start_time, end_time)
VALUES (:'clinic_id', :'doctor_id', :'weekday'::smallint, '09:00', '17:00');
SQL

access_token="$(python3 - "$JWT_SECRET" "$user_id" "$clinic_id" "$email" <<'PY'
import base64
import hashlib
import hmac
import json
import sys
import time

def encode_segment(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

now = int(time.time())
header = encode_segment(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
payload = encode_segment(json.dumps({
    "sub": sys.argv[2],
    "clinic_id": sys.argv[3],
    "role": "doctor",
    "email": sys.argv[4],
    "exp": now + 300,
    "iat": now,
    "typ": "access",
}, separators=(",", ":")).encode())
message = f"{header}.{payload}"
signature = hmac.new(sys.argv[1].encode(), message.encode(), hashlib.sha256).digest()
print(f"{message}.{encode_segment(signature)}")
PY
)"

post_appointment() {
  local response_file="$1"
  curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    -X POST http://127.0.0.1:8080/appointments \
    -H "Authorization: Bearer ${access_token}" \
    -H 'Content-Type: application/json' \
    -d "{\"doctor_id\":\"${doctor_id}\",\"patient_phone\":\"${patient_phone}\",\"patient_name\":\"Booking API Test\",\"starts_at\":\"${starts_at}\",\"source\":\"admin\"}"
}

post_appointment "$temp_dir/response-one.json" >"$temp_dir/status-one" &
first_request=$!
post_appointment "$temp_dir/response-two.json" >"$temp_dir/status-two" &
second_request=$!
wait "$first_request"
wait "$second_request"

status_one="$(cat "$temp_dir/status-one")"
status_two="$(cat "$temp_dir/status-two")"
if [[ "$status_one" == 409 && "$status_two" =~ ^2[0-9][0-9]$ ]] || \
   [[ "$status_two" == 409 && "$status_one" =~ ^2[0-9][0-9]$ ]]; then
  echo "Appointment API rejected the duplicate slot (HTTP $status_one, HTTP $status_two)."
else
  cat "$temp_dir/response-one.json" "$temp_dir/response-two.json" >&2
  echo "Expected one successful booking and one HTTP 409; received HTTP $status_one and HTTP $status_two." >&2
  exit 1
fi
