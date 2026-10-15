#!/bin/bash
# scripts/healthcheck.sh - فحص شامل
set -e

echo "🏥 Sahels Health Check"
echo "======================"

# Bot
if curl -sf http://localhost:3000/health > /dev/null; then
  echo "✅ Bot        OK  $(curl -s http://localhost:3000/health)"
else
  echo "❌ Bot        DOWN"
fi

# Central
if curl -sf http://localhost:4000/health > /dev/null; then
  echo "✅ Central    OK"
else
  echo "❌ Central    DOWN"
fi

# Postgres
if docker compose exec -T postgres pg_isready -U sahels > /dev/null 2>&1; then
  echo "✅ Postgres   OK"
else
  echo "❌ Postgres   DOWN"
fi

# Redis
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "✅ Redis      OK"
else
  echo "❌ Redis      DOWN"
fi

# NocoDB
if curl -sf http://localhost:8080 > /dev/null; then
  echo "✅ NocoDB     OK"
else
  echo "❌ NocoDB     DOWN"
fi

echo ""
echo "📊 Docker stats:"
docker compose ps