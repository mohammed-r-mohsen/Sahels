# 🚀 دليل النشر

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

0 3 * * * /opt/sahels/scripts/backup.sh >> /var/log/sahels-backup.log 2>&1

./scripts/healthcheck.sh

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





