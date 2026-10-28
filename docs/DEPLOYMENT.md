# 🚀 دليل النشر

## نشر الإنتاج

1. انسخ `.env.production.example` إلى `.env`، واستبدل كل قيمة `REPLACE_...`. ولّد كلمات مرور قاعدة البيانات وRedis والمفاتيح بـ`openssl rand -hex 32`. لا تحفظ `.env` في Git ولا ترسل الأسرار في المحادثات.
2. أضف سجل DNS لـ`app.sahels.net` إلى عنوان الخادم واجعل Proxy في Cloudflare مفعلاً. استخدم Cloudflare SSL/TLS mode **Full (strict)**.
3. قبل تفعيل UFW، نفّذ النشر مع CIDR ثابت لجهاز الإدارة: `SSH_ALLOW_CIDR=203.0.113.10/32 ./infra/deploy.sh`. يستبدل `infra/cloudflare-ufw.sh` فتح HTTP/HTTPS العام بقواعد لعناوين Cloudflare المنشورة فقط. احرص على وجود console/مخرج طوارئ لدى مزود VPS قبل تغيير الجدار الناري.
4. أصدر شهادة TLS لـ`app.sahels.net`، ثم ثبّت `infra/nginx-production.conf` في Nginx وأعد تحميله. يبقى HTTP مخصصاً لتحويل HTTPS وACME؛ لا تفتح منافذ Postgres أو Redis أو API أو أدوات المراقبة للعامة.
5. ابدأ التطبيق بـ`docker compose up -d --build`. قاعدة البيانات وRedis وAPI والواجهة مرتبطة على loopback فقط؛ كلمات مرور Postgres وRedis ومفاتيح Meta مطلوبة ولا توجد قيم إنتاج افتراضية.
6. فعّل المراقبة بـ`docker compose --profile monitoring up -d`. افتح Grafana عبر SSH tunnel إلى `127.0.0.1:3001` وPrometheus إلى `127.0.0.1:9090`. خزّن كلمة مرور Grafana القوية في `.env`.
7. أعد `ALERTMANAGER_WEBHOOK_URL` إلى مستقبل متوافق مع Alertmanager لتسليم تنبيهات Prometheus، و`ALERT_WEBHOOK_URL` إلى مستقبل JSON بسيط لتنبيهات النسخ والفحص الدوري. القيمة النموذجية لا ترسل تنبيهات قبل استبدالها.
8. جدْول النسخ اليومية وفحص الصحة بعد تحميل متغيرات `.env`:

```cron
0 3 * * * cd /opt/sahels && set -a && . ./.env && set +a && ./scripts/backup.sh >> /var/log/sahels-backup.log 2>&1
*/5 * * * * cd /opt/sahels && set -a && . ./.env && set +a && ./scripts/healthcheck.sh >> /var/log/sahels-healthcheck.log 2>&1
```

النسخ custom-format مع SHA-256، تحقق قبل الحفظ، واحتفاظ 30 يوماً على القرص المحلي. انسخها دورياً إلى تخزين خارجي مشفر واختبر الاستعادة على بيئة منفصلة؛ وجود نسخة على نفس القرص لا يحمي من فقدانه.

GitHub Actions يشغّل CI للـ Rust وNext.js وCompose. النشر متاح يدوياً من `main` عبر workflow `Deploy production` بعد ضبط GitHub Environment باسم `production` والأسرار `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`. يتطلب مضيف النشر checkout نظيفاً للمستودع في `/opt/sahels` وملف `.env` مضبوطاً.

## المتطلبات

- VPS في السعودية (Oracle Cloud Jeddah أو مزود محلي)
- Ubuntu 22.04 أو 24.04
- 4 GB RAM + 2 vCPU (single) أو 16 GB RAM + 8 vCPU (multi)
- دومين + SSL

## خطوات النشر

### 1. تجهيز السيرفر

```bash
ssh root@SERVER_IP
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin nginx certbot python3-certbot-nginx -y

cd /opt
git clone https://github.com/USER/sahels.git
cd sahels
cp .env.single.example .env
nano .env  # عدّل القيم

docker compose up -d --build
docker compose logs -f

nano /etc/nginx/sites-available/sahels

server {
    listen 80;
    server_name clinic1.example.com;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

ln -s /etc/nginx/sites-available/sahels /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d clinic1.example.com

docker compose exec -T postgres psql -U sahels -d sahels < scripts/seed-clinic.sql

# أضف cron
crontab -e

0 3 * * * cd /opt/sahels && set -a && . ./.env && set +a && ./scripts/backup.sh >> /var/log/sahels-backup.log 2>&1
*/5 * * * * cd /opt/sahels && set -a && . ./.env && set +a && ./scripts/healthcheck.sh >> /var/log/sahels-healthcheck.log 2>&1

cd /opt/sahels
git pull
docker compose up -d --build
docker compose logs -f


---

### `docs/MULTI_TENANT.md`

```markdown
# 🌐 Multi-Tenancy

## الفكرة

عيادة واحدة يمكن أن تعمل في وضعين:

| الوضع | الاستخدام | TENANCY_MODE |
|-------|-----------|--------------|
| Single | عيادة على سيرفر خاص | `single` |
| Multi | عدة عيادات على سيرفر مركزي | `multi` |

## كيف يعمل Resolver

عند وصول Webhook، نحدد `clinicId` بالترتيب:

1. **Header** `x-clinic-id` (يضيفه Nginx)
2. **Subdomain** `clinic1.sahels.net` → `clinic1`
3. **Channel Identity** `phone_number_id` أو `ig_user_id`

```js
const clinicId = await resolveClinicId({
  channel: 'whatsapp',
  externalId: phone_number_id,
  hostname: req.headers.host,
  headerClinicId: req.headers['x-clinic-id']
});



server {
    listen 443 ssl http2;
    server_name ~^(?<clinic>[^.]+)\.sahels\.net$;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Clinic-Id $clinic;
        proxy_set_header Host $host;
    }
}



./scripts/add-clinic.sh riyadh_01 "عيادة الرياض" \
  966500000000 123456789 TOKEN trial 3

  ./scripts/clinic-feature.sh enable riyadh_01 whatsapp
./scripts/clinic-feature.sh disable riyadh_01 deposit

./scripts/clinic-subscription.sh renew riyadh_01 30
./scripts/clinic-subscription.sh suspend riyadh_01
./scripts/clinic-subscription.sh check riyadh_01







---

### `docs/TESTING.md`

```markdown
# 🧪 الاختبار المحلي

## 1. تشغيل المشروع

```bash
cp .env.single.example .env
docker compose up -d
docker compose logs -f





