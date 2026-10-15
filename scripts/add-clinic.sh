#!/bin/bash
# scripts/add-clinic.sh - إضافة عيادة جديدة
set -euo pipefail

CID=$1
CNAME=$2
WNUM=$3
WPID=$4
WTOK=$5
PLAN=${6:-trial}
DAYS=${7:-3}
IGID=${8:-}
IGTOK=${9:-}

if [ -z "$CID" ] || [ -z "$CNAME" ]; then
  echo "Usage: $0 <clinic_id> <name> <wa_number> <wa_phone_id> <wa_token> [plan] [days] [ig_id] [ig_token]"
  echo "Example: $0 riyadh_01 'عيادة الرياض' 966500000000 123456789 token trial 3"
  exit 1
fi

ENDS_AT=$(date -d "+${DAYS} days" -u +"%Y-%m-%d %H:%M:%S+00" 2>/dev/null || date -v+"${DAYS}"d -u +"%Y-%m-%d %H:%M:%S+00")

docker compose exec -T postgres psql -U sahels -d sahels <<SQL
INSERT INTO clinics (id, name, wa_number, status) VALUES ('$CID', '$CNAME', '$WNUM', 'online')
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, wa_number=EXCLUDED.wa_number;

INSERT INTO channel_identities (clinic_id, channel, external_id, access_token)
VALUES ('$CID', 'whatsapp', '$WPID', '$WTOK')
ON CONFLICT (channel, external_id) DO UPDATE SET access_token=EXCLUDED.access_token;

INSERT INTO clinic_subscriptions (clinic_id, plan, status, ends_at, trial_ends_at)
VALUES ('$CID', '$PLAN', 'active', '$ENDS_AT', '$ENDS_AT')
ON CONFLICT (clinic_id) DO UPDATE SET
  plan=EXCLUDED.plan, status='active', ends_at=EXCLUDED.ends_at, updated_at=NOW();

INSERT INTO clinic_features (clinic_id, feature, enabled) VALUES
  ('$CID', 'whatsapp', TRUE),
  ('$CID', 'instagram', FALSE),
  ('$CID', 'reception', TRUE),
  ('$CID', 'deposit', FALSE),
  ('$CID', 'reminder_3h', TRUE),
  ('$CID', 'waiting_list', TRUE),
  ('$CID', 'flow_booking', FALSE),
  ('$CID', 'reports', TRUE)
ON CONFLICT (clinic_id, feature) DO NOTHING;

INSERT INTO clinic_deposit_config (clinic_id, enabled, amount_sar)
VALUES ('$CID', FALSE, 50)
ON CONFLICT (clinic_id) DO NOTHING;
SQL

if [ -n "$IGID" ] && [ -n "$IGTOK" ]; then
  docker compose exec -T postgres psql -U sahels -d sahels <<SQL
INSERT INTO channel_identities (clinic_id, channel, external_id, access_token)
VALUES ('$CID', 'instagram', '$IGID', '$IGTOK')
ON CONFLICT (channel, external_id) DO UPDATE SET access_token=EXCLUDED.access_token;
SQL
fi

echo "✅ Clinic $CID added, subscription ends $ENDS_AT"