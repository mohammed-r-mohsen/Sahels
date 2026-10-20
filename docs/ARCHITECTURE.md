# البنية المعمارية — Sahel Systems v4

منصة SaaS متعددة العيادات لحجز المواعيد عبر القنوات (واتساب / إنستغرام / بوابة) مع عزل صارم للمستأجرين.

## الأنظمة التسعة

| # | النظام | المسؤولية | التقنيات |
|---|--------|-----------|----------|
| 1 | **IAM** | JWT + Refresh، RBAC، عزل `clinic_id`، RLS | Axum Middleware، Argon2، PostgreSQL RLS |
| 2 | **Clinic Management** | ملف العيادة، الأطباء، الجداول، الإعدادات | Axum + SQLx |
| 3 | **Appointment Engine** | توفر، حجز بـ Advisory Locks، قائمة انتظار | PostgreSQL EXCLUDE + `pg_advisory_xact_lock` |
| 4 | **Omnichannel Messaging** | Webhooks Meta (HMAC)، توجيه، طابور إرسال | Redis، WhatsApp Cloud API |
| 5 | **AI & Automation** | NLP، Function Calling، توقع الغياب، تذكيرات | LLM + Redis queues *(أساس جاهز)* |
| 6 | **Billing** | خطط 299/469/759، Moyasar، Subscription Guard | payments + plans |
| 7 | **Frontend** | لوحة العيادة، بوابة المريض، Super Admin | Next.js + Tailwind |
| 8 | **Analytics** | إيرادات، إشغال، No-Show، مصادر الحجز | SQL + Charts |
| 9 | **Infra** | Docker، Nginx، نسخ احتياطي، مراقبة | Docker Compose، CI |

## المكوّنات التشغيلية

```
Internet → Nginx/Cloudflare
              │
     ┌────────┴────────┐
     │   sahel-api     │  Rust / Axum :8080
     │  (modular mono) │
     └────┬───────┬────┘
          │       │
     PostgreSQL  Redis
     (RLS)       (queues / cache)
          │
     apps/web (Next.js :3000)
```

الكود القديم في `backend/src` مقسوم حسب الأنظمة: `auth`، `services/clinic`، `services/appointments`، `services/messaging`، `services/billing`، `routes/analytics`.

## تدفق الحجز عبر واتساب

1. المريض يرسل رسالة → Meta Webhook → `POST /webhooks/meta`
2. التحقق من التوقيع HMAC-SHA256
3. حل العيادة عبر `clinic_tokens.external_id`
4. تخزين الرسالة في `message_logs` (ثم AI / Human Handoff)
5. محرك المواعيد يفحص الجدول ويقفل الطبيب (`pg_advisory_xact_lock`) ويمنع التداخل (EXCLUDE)
6. رسالة تأكيد عبر طابور الإرسال
7. لوحة العيادة تعرض الموعد والتقارير

## عزل المستأجرين (Tenant Isolation)

- JWT يحمل `clinic_id` + `role`
- كل معاملة API تستدعي `set_config('app.clinic_id', …)` و `app.is_super` ثم تبدّل إلى دور PostgreSQL المقيد `sahel_app`
- جداول المستأجر عليها **FORCE ROW LEVEL SECURITY**
- عمليات الهوية (login/register) تستخدم bypass مراقب (`app.is_super=true`) داخل معاملة قصيرة
- يتحقق Middleware من حالة الحساب والعيادة والدور الحاليين في قاعدة البيانات مع كل طلب محمي
- refresh tokens محفوظة كبصمات، وتدويرها يتم داخل معاملة مقفلة مع RLS

## التسجيل والدخول

واجهة التسجيل تستدعي `POST /auth/register` لإنشاء العيادة والمدير باعتماد `clinic_name`, `slug`, `email`, `password`, و`full_name`. يُفرض دور `clinic_admin` من الخادم، وتُنشأ العيادة والحساب في معاملة واحدة. كلمات المرور الجديدة تتطلب 12 حرفاً على الأقل وتُخزّن باستخدام Argon2.

`POST /auth/login` يصدر access وrefresh JWT. يحتفظ المتصفح بهما عبر عميل API، ويجدد access تلقائياً باستخدام refresh token المُدوّر. `POST /auth/logout` يلغي refresh token. المسار `GET /auth/me` يعرض بيانات الجلسة من قاعدة البيانات ويُستخدم لحماية واجهة لوحة التحكم.

عيّن `JWT_SECRET` إلى سر عشوائي بطول 32 بايت على الأقل قبل تشغيل Docker Compose؛ القيمة التوضيحية في `.env.example` مرفوضة من الخدمة. إعادة تعيين كلمة المرور والتحقق من البريد الإلكتروني لم يُفعّلا بعد.

## الأدوار (RBAC)

`super_admin` · `clinic_admin` · `doctor` · `receptionist`

## الكود القديم (v3)

المجلد `legacy/` يحتفظ بنسخة Node.js السابقة (bot/central/agent) للرجوع إليها فقط.
