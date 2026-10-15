#!/bin/bash
# scripts/clinic-subscription.sh - إدارة اشتراك العيادة
set -euo pipefail

ACTION=$1
CID=$2

case "$ACTION" in
  renew)
    DAYS=${3:-30}
    ENDS_AT=$(date -d "+${DAYS} days" -u +"%Y-%m-%d %H:%M:%S+00" 2>/dev/null || date -v+"${DAYS}"d -u +"%Y-%m-%d %H:%M:%S+00")
    docker compose exec -T postgres psql -U sahels -d sahels <<SQL
UPDATE clinic_subscriptions
SET status='active', ends_at='$ENDS_AT', paid_at=NOW(), updated_at=NOW()
WHERE clinic_id='$CID';
SQL
    echo "✅ Renewed for $DAYS days, ends $ENDS_AT"
    ;;
  suspend)
    docker compose exec -T postgres psql -U sahels -d sahels -c \
      "UPDATE clinic_subscriptions SET status='suspended', updated_at=NOW() WHERE clinic_id='$CID';"
    echo "⏸️  Suspended"
    ;;
  activate)
    docker compose exec -T postgres psql -U sahels -d sahels -c \
      "UPDATE clinic_subscriptions SET status='active', updated_at=NOW() WHERE clinic_id='$CID';"
    echo "▶️  Activated"
    ;;
  check)
    docker compose exec -T postgres psql -U sahels -d sahels -c \
      "SELECT clinic_id, plan, status, ends_at, EXTRACT(DAY FROM ends_at - NOW())::INT AS days_left FROM clinic_subscriptions WHERE clinic_id='$CID';"
    ;;
  list)
    docker compose exec -T postgres psql -U sahels -d sahels -c \
      "SELECT clinic_id, plan, status, ends_at, EXTRACT(DAY FROM ends_at - NOW())::INT AS days_left FROM clinic_subscriptions ORDER BY ends_at;"
    ;;
  *) echo "Usage: $0 renew|suspend|activate|check|list <clinic_id> [days]"; exit 1 ;;
esac

docker compose restart bot > /dev/null 2>&1