# ساهل — Sahel Systems v4

منصة حجز مواعيد ذكية للعيادات (SaaS متعدد المستأجرين) مع واتساب وإنستغرام وبوابة ويب، مبنية على **Rust (Axum)** و **PostgreSQL (RLS)** و **Redis** و **Next.js**.

## التشغيل السريع

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:8080/health
```

واجهة الويب (تطوير):

```bash
cd apps/web
npm install
npm run dev
```

قبل التشغيل، استبدل `JWT_SECRET` في `.env` بقيمة عشوائية لا تقل عن 32 بايت. لا تستخدم القيمة التوضيحية في الإنتاج.

## تسجيل عيادة جديدة

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"clinic_name\":\"عيادة النور\",\"slug\":\"alnoor\",\"email\":\"admin@alnoor.sa\",\"password\":\"Secret123!Sahel\",\"full_name\":\"مدير العيادة\"}"
```

## أهم المسارات

| Method | Path | الوصف |
|--------|------|--------|
| POST | `/auth/register` | إنشاء عيادة + مدير |
| POST | `/auth/login` | JWT + Refresh |
| GET | `/clinic` | ملف العيادة |
| GET/POST | `/clinic/doctors` | الأطباء |
| GET/POST | `/appointments` | المواعيد |
| GET | `/appointments/availability` | الأوقات المتاحة |
| GET/POST | `/appointments/waiting-list` | قائمة الانتظار |
| GET | `/analytics/overview` | ملخص تشغيلي |
| POST | `/webhooks/meta` | واتساب/إنستغرام |
| GET | `/billing/plans` | خطط الاشتراك |

## الهيكل

```
backend/          # sahel-api (Rust)
apps/web/         # لوحة التحكم (Next.js)
docs/             # الوثائق
legacy/           # النظام القديم (Node) — أرشيف
infra/            # Nginx وغيره
```

التفاصيل المعمارية: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## التوافق

- PDPL (موافقة + احتفاظ سنتين عبر `consents`)
- عزل بيانات العيادات عبر RLS
- Subscription Guard عند تعليق الاشتراك
