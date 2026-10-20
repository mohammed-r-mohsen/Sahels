#!/bin/bash
set -euo pipefail

echo "🏥 Sahels v3.2 Installer"
echo "========================="

if ! command -v docker &>/dev/null; then
  echo "⏳ Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi

echo ""
echo "اختر وضع التشغيل:"
echo "  1) single  - عيادة واحدة على سيرفر مستقل"
echo "  2) multi   - عدة عيادات على سيرفر مركزي"
read -rp "اختيارك [1/2]: " MODE

if [ "$MODE" = "1" ]; then
  cp .env.single.example .env
  echo "✅ تم نسخ .env.single.example إلى .env"
else
  cp .env.multi.example .env
  echo "✅ تم نسخ .env.multi.example إلى .env"
fi

echo ""
echo "📝 عدّل ملف .env ثم شغّل:"
echo "   docker compose up -d --build"