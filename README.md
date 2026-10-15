# 🏥 Sahels

نظام حجز مواعيد ذكي للعيادات يدعم WhatsApp + Instagram + Walk-in + Deposits، مبني على Node.js و PostgreSQL و Redis، متوافق مع PDPL السعودي.

![CI](https://github.com/USER/sahels/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-3.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ الميزات

- 💬 **WhatsApp Cloud API** - حجز تلقائي عبر واتساب
- 📱 **WhatsApp Flows** - نموذج حجز كامل داخل واتساب
- 📸 **Instagram Messaging** - رد آلي على DM
- 🚶 **Walk-in** - Reception Lite للحجز المباشر
- 💳 **Deposits** - عربون اختياري لكل عيادة (قابل للإلغاء)
- 📊 **Monthly Reports** - تقارير شهرية تلقائية للمالك
- 🎯 **Predictive Cancellation** - توقع الإلغاءات
- 🔒 **PDPL Compliant** - موافقة صريحة + Retention
- 🛡️ **Subscription Guard** - إيقاف تلقائي عند انتهاء الاشتراك
- 🎛️ **Feature Flags** - كل ميزة قابلة للتفعيل/الإلغاء

## 🏗️ الوضعان

| الوضع | الاستخدام | السيرفر |
|-------|-----------|---------|
| **single** | عيادة واحدة على سيرفر مستقل | VPS 4GB RAM |
| **multi**  | 30+ عيادة على سيرفر مركزي | VPS 16-32GB RAM |

يتم التحكم به عبر `TENANCY_MODE=single|multi` في `.env`.

## 🚀 التركيب السريع

```bash
git clone https://github.com/USER/sahels.git
cd sahels
cp .env.single.example .env
# عدّل القيم في .env
docker compose up -d
curl http://localhost:3000/health