# 🏗️ البنية المعمارية

## نظرة عامة

Sahels نظام حجز مواعيد متعدد العيادات، يعمل بوضعين:

- **Single Tenant**: عيادة واحدة على سيرفر مستقل
- **Multi Tenant**: عدة عيادات على سيرفر مركزي

## المكونات

┌──────────────────────────────────────────────────┐
│ Cloudflare / Nginx (SSL) │
└────────────┬─────────────────────────────────────┘
│
┌────────┴─────────┬──────────────┬────────────┐
│ │ │ │
┌───▼────┐ ┌─────▼────┐ ┌──────▼───┐ ┌─────▼────┐
│ Bot │ │ Central │ │ NocoDB │ │ Agent │
│ :3000 │ │ :4000 │ │ :8080 │ │ (loop) │
└───┬────┘ └─────┬────┘ └──────┬───┘ └─────┬────┘
│ │ │ │
└──────────────────┴──────┬───────┴────────────┘
│
┌─────────┴─────────┐
│ │
┌─────▼─────┐ ┌─────▼────┐
│PostgreSQL │ │ Redis │
│ :5432 │ │ :6379 │
└───────────┘ └──────────┘


## الخدمات

| الخدمة | الوصف | المكتبات |
|--------|-------|----------|
| **bot** | Webhooks + State Machine + Queue | express, bullmq, pg |
| **central** | Registration + Heartbeat + Reports | express, pg, nodemailer |
| **agent** | Heartbeat agent (يرسل إحصاءات) | node-fetch, pg |
| **postgres** | قاعدة البيانات الرئيسية | postgres:15 |
| **redis** | Queue + State + Cache | redis:7 |
| **nocodb** | لوحة تحكم بصرية | nocodb/nocodb |

## تدفق البيانات

### حجز عبر واتساب

المريض يرسل "احجز" → WhatsApp Cloud API

Meta ترسل Webhook إلى Bot /webhook

Bot يتحقق من التوقيع (HMAC SHA256)

Bot يستخرج clinicId من phone_number_id

checkAccess() يتحقق من الاشتراك والميزة

State Machine يتقدم: idle → awaiting_name → ... → awaiting_time

bookWithLock() يستخدم pg_advisory_xact_lock لمنع التضارب

إذا العربون مفعّل → ينشئ Moyasar invoice ويرسل الرابط

Patient يدفع → Moyasar callback → تحديث Booking

Cron: 3h reminder قبل الموعد


## الأمان

- **Webhook signature verification** (HMAC SHA256)
- **API tokens**: RECEPTION_TOKEN, ADMIN_TOKEN, REGISTRATION_KEY
- **Advisory locks** لمنع race conditions
- **Cache invalidation** عند تغيير الميزات
- **PDPL compliance**: consent, retention, encryption in transit

## PDPL Compliance

- Consent explicit قبل أي معالجة
- Retention 2 سنوات
- Data in Saudi Arabia
- Audit logs لكل وصول



