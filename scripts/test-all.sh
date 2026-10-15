#!/bin/bash
# scripts/test-all.sh - اختبار شامل
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Sahels Full Test Suite"
echo "========================="

# 1. Health
echo ""
echo "1️⃣  Health checks..."
"$SCRIPT_DIR/healthcheck.sh"

# 2. Full booking flow
echo ""
echo "2️⃣  Testing booking flow..."
PHONE="9665012$(date +%s | tail -c 6)"
for msg in "مرحبا" "موافق" "احجز" "أحمد" "كشف" "2026-12-01" "11:00"; do
  "$SCRIPT_DIR/test-webhook.sh" "$PHONE" "$msg"
  sleep 0.5
done

sleep 2
COUNT=$(docker compose exec -T postgres psql -U sahels -d sahels -t -c \
  "SELECT COUNT(*) FROM bookings WHERE patient_phone='$PHONE'" | tr -d ' \n')
if [ "$COUNT" -gt 0 ]; then
  echo "   ✅ Booking created"
else
  echo "   ❌ Booking failed"
fi

# 3. Subscription guard
echo ""
echo "3️⃣  Testing subscription guard..."
docker compose exec -T postgres psql -U sahels -d sahels -c \
  "UPDATE clinic_subscriptions SET status='suspended' WHERE clinic_id='test_clinic'" > /dev/null

curl -s -X POST http://localhost:3000/api/admin/invalidate-cache \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN:-test_admin_token}" \
  -d '{"clinic_id":"test_clinic"}' > /dev/null || true

"$SCRIPT_DIR/test-webhook.sh" "966500000000" "مرحبا" > /dev/null
if docker compose logs bot --tail 10 2>&1 | grep -q "BLOCKED"; then
  echo "   ✅ Guard blocked message"
fi

docker compose exec -T postgres psql -U sahels -d sahels -c \
  "UPDATE clinic_subscriptions SET status='active', ends_at=NOW()+INTERVAL '3 days' WHERE clinic_id='test_clinic'" > /dev/null

echo ""
echo "✅ Test suite complete"