#!/bin/bash
# scripts/test-webhook.sh - محاكاة رسالة واتساب
PHONE=${1:-966501234567}
TEXT="$2"
HOST=${3:-http://localhost:3000}

if [ -z "$TEXT" ]; then
  echo "Usage: $0 <phone> <text> [host]"
  echo "Example: $0 966501234567 'مرحبا'"
  exit 1
fi

curl -s -X POST "$HOST/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"metadata\": { \"phone_number_id\": \"123456\" },
          \"messages\": [{
            \"from\": \"$PHONE\",
            \"id\": \"wamid.$(date +%s)\",
            \"text\": { \"body\": \"$TEXT\" },
            \"type\": \"text\"
          }]
        }
      }]
    }]
  }" > /dev/null
echo "→ Sent: $TEXT"