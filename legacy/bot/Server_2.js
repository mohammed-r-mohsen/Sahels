// bot/Server_2.js
process.env.TZ = 'Asia/Riyadh';

const crypto = require('crypto');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');
const IORedis = require('ioredis');
const rateLimit = require('express-rate-limit'); // أضفنا مكتبة الحماية

const { pool } = require('./lib/db');
const { initQueue, closeQueue, getWhatsappQueue } = require('./lib/queue');
const { resolveClinicId } = require('./lib/clinic-resolver');
const { sendWhatsApp, sendInstagram } = require('./lib/sender');
const { CONSENT_MSG, MEDICAL_DISCLAIMER, isEmergency, isMedical } = require('./lib/compliance');
const { isMulti, isSingle, getStaticClinicId, TENANCY_MODE } = require('./lib/tenancy');
const { getClinicContext, invalidateCache } = require('./lib/features');
const { checkAccess, requireActiveSubscription } = require('./lib/subscription-guard');
const { createDepositInvoice, scheduleDepositExpiry } = require('./lib/deposit');
const { chatWithAI } = require('./lib/ai');
const { createToolExecutor } = require('./lib/ai-tools');

const app = express();

// ============================================
// 🔒 حماية ضد انهيار الخادم (Async Error Handler)
// ============================================
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// 🛡️ تحديد معدل الطلبات (Rate Limiting)
// ============================================
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // دقيقة واحدة
  max: 100, // 100 طلب كحد أقصى
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const RECEPTION_TOKEN = process.env.RECEPTION_TOKEN;

// 🔴 منع تشغيل البوت إذا لم يتم تعيين السر (الأمان أولاً)
if (!META_APP_SECRET) {
  console.error('[SECURITY FATAL] META_APP_SECRET is not set. Exiting to prevent spoofed webhooks.');
  process.exit(1);
}

console.log(`[BOOT] Sahels v3.5 mode=${TENANCY_MODE}`);

initQueue();

let stateConn = null;
if (process.env.REDIS_URL) {
  stateConn = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}
const stateKey = (clinicId, channel, from) => `state:${clinicId}:${channel}:${from}`;

async function getState(clinicId, channel, from) {
  if (!stateConn) return { step: 'idle' };
  const raw = await stateConn.get(stateKey(clinicId, channel, from));
  return raw ? JSON.parse(raw) : { step: 'idle' };
}
async function setState(clinicId, channel, from, state, ttl = 900) {
  if (!stateConn) return;
  await stateConn.set(stateKey(clinicId, channel, from), JSON.stringify(state), 'EX', ttl);
}
async function clearState(clinicId, channel, from) {
  if (!stateConn) return;
  await stateConn.del(stateKey(clinicId, channel, from));
}

async function sendToChannel(ctx, channel, to, text, opts = {}) {
  if (channel === 'instagram') {
    return sendInstagram({ igUserId: ctx.ig_id, token: ctx.ig_token, to, text });
  }
  return sendWhatsApp({ phoneId: ctx.wa_phone_id, token: ctx.wa_token, to, text, template: opts.template });
}

// ============================================
// دالة الحجز
// ============================================
async function bookWithLock({ clinic_id, patient_phone, patient_name, date, time, source, service, capacity = 1 }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockKey = Math.abs(`${clinic_id}|${date}|${time}`.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    const countRes = await client.query(
      `SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND date=$2 AND time=$3 AND status IN ('pending','confirmed')`,
      [clinic_id, date, time]
    );

    if (parseInt(countRes.rows[0].c) >= capacity) {
      await client.query('ROLLBACK');
      return { ok: false, error: `الموعد ${time} ممتلئ. اختر وقتاً آخر.` };
    }

    const ins = await client.query(
      `INSERT INTO bookings (clinic_id, patient_phone, patient_name, date, time, service, source, status, consent_given, slot_capacity)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',TRUE,$8) RETURNING *`,
      [clinic_id, patient_phone, patient_name, date, time, service, source, capacity]
    );
    await client.query('COMMIT');
    return { ok: true, booking: ins.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return { ok: false, error: 'الوقت محجوز.' };
    throw e;
  } finally { client.release(); }
}

const executeTool = createToolExecutor({ pool, bookWithLock });

// ============================================
// معالجة الرسائل
// ============================================
async function handleIncoming({ clinicId, channel, from, text, phoneNumberId }) {
  const access = await checkAccess(clinicId, channel);
  if (!access.allowed) return;
  const ctx = access.context;

  // 🔴 إصلاح: مطابقة تامة لكلمة "موافق"
  const consent = await pool.query('SELECT 1 FROM consents WHERE clinic_id=$1 AND patient_ref=$2', [clinicId, from]);
  if (consent.rows.length === 0) {
    const st = await getState(clinicId, channel, from);
    if (st.step !== 'awaiting_consent') {
      await sendToChannel(ctx, channel, from, CONSENT_MSG);
      await setState(clinicId, channel, from, { step: 'awaiting_consent' });
      return;
    }

    const cleanText = text.trim();
    if (cleanText === 'رفض') {
      await sendToChannel(ctx, channel, from, 'نأسف لسماع ذلك. لن نتمكن من مساعدتك بدون موافقتك.');
      await clearState(clinicId, channel, from);
      return;
    }
    // الرفض الدقيق والموافقة الدقيقة
    if (cleanText !== 'موافق') {
      await sendToChannel(ctx, channel, from, 'الرجاء إرسال كلمة "موافق" للمتابعة، أو "رفض" للانصراف.');
      return;
    }

    await pool.query('INSERT INTO consents (clinic_id, patient_ref, consent_text) VALUES ($1,$2,$3)', [clinicId, from, CONSENT_MSG]);
    await clearState(clinicId, channel, from);
    await sendToChannel(ctx, channel, from, '✅ شكراً لك! تم تسجيل موافقتك. كيف أقدر أساعدك اليوم؟');
    return;
  }

  // كشف الطوارئ (بعد تعديل compliance)
  if (isEmergency(text)) {
    await sendToChannel(ctx, channel, from, `تم تحويلك لموظف بشري فوراً.\n${MEDICAL_DISCLAIMER}`);
    await pool.query('INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)', [clinicId, 'emergency_handoff', JSON.stringify({ from, channel })]);
    return;
  }
  if (isMedical(text)) {
    await sendToChannel(ctx, channel, from, `عذراً، هذا البوت للحجز فقط وليس استشارة طبية.`);
    return;
  }

  const lower = text.trim().toLowerCase();

  // 🔴 إصلاح: الحذف الشامل
  if (lower.includes('حذف بياناتي')) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM consents WHERE clinic_id=$1 AND patient_ref=$2', [clinicId, from]);
      await client.query('DELETE FROM bookings WHERE clinic_id=$1 AND patient_phone=$2', [clinicId, from]);
      await client.query('DELETE FROM waiting_list WHERE clinic_id=$1 AND patient_phone=$2', [clinicId, from]);
      await client.query('DELETE FROM patient_features WHERE clinic_id=$1 AND patient_phone=$2', [clinicId, from]);
      // لا نحذف الدفعات لأنها سجلات مالية، لكننا نفصلها عن المريض (نغير رقمه)
      await client.query(`UPDATE payments SET raw_response = '{"deleted": true}' WHERE clinic_id=$1 AND booking_id IN (SELECT id FROM bookings WHERE patient_phone=$2)`, [clinicId, from]);
      await client.query('COMMIT');
      await sendToChannel(ctx, channel, from, '✅ تم حذف جميع بياناتك الشخصية من النظام (حق الحذف - PDPL).');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[DELETE DATA ERROR]', e);
      await sendToChannel(ctx, channel, from, 'حدث خطأ أثناء الحذف، يرجى المحاولة لاحقاً.');
    } finally { client.release(); }
    return;
  }

  // 🔴 إصلاح: إلغاء الحجز (تحديث الحالة بدلاً من الحذف النهائي)
  if (lower === 'الغاء' || lower === 'إلغاء') {
    const r = await pool.query(
      `UPDATE bookings SET status='cancelled', updated_at=NOW()
             WHERE clinic_id=$1 AND patient_phone=$2 AND date>=CURRENT_DATE AND status IN ('pending','confirmed')
             RETURNING id, date, time`, [clinicId, from]
    );

    if (r.rows.length > 0) {
      const b = r.rows[0];
      await sendToChannel(ctx, channel, from, `✅ تم إلغاء موعدك يوم ${b.date} الساعة ${b.time}.`);

      // 🔴 إصلاح: ترقية من قائمة الانتظار في نفس الوقت المفرغ
      const next = await pool.query('SELECT * FROM waiting_list WHERE clinic_id=$1 ORDER BY created_at LIMIT 1', [clinicId]);
      if (next.rows[0]) {
        const w = next.rows[0];
        const res = await bookWithLock({
          clinic_id: clinicId, patient_phone: w.patient_phone, patient_name: w.patient_name,
          date: b.date, time: b.time, source: 'waiting', service: w.service
        });
        if (res.ok) {
          await sendToChannel(ctx, 'whatsapp', w.patient_phone, `🎉 صار موعد فاضي! حجزنا لك يوم ${b.date} الساعة ${b.time}`);
          await pool.query('DELETE FROM waiting_list WHERE id=$1', [w.id]);
        }
      }
    } else {
      await sendToChannel(ctx, channel, from, 'ما لقيت لك أي موعد قادم لإلغائه.');
    }
    return;
  }

  // الذكاء الاصطناعي
  try {
    const result = await chatWithAI({
      clinicId, from, userMessage: text,
      onToolCall: async (name, args) => executeTool(name, args, { clinicId, from, channel })
    });
    if (result.text) await sendToChannel(ctx, channel, from, result.text);
  } catch (e) {
    console.error('[AI ERROR]', e.message);
    await sendToChannel(ctx, channel, from, 'عذراً، حدث خطأ تقني. حاول مرة أخرى، أو اكتب "موظف".');
  }
}

// ============================================
// Webhook (معالج بشكل صحيح)
// ============================================
app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), asyncHandler(async (req, res) => {
  // التحقق من التوقيع
  const sig = req.headers['x-hub-signature-256'];
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.body).digest('hex');
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.sendStatus(403);
  }

  const body = JSON.parse(req.body.toString('utf8'));
  const entry = body.entry?.[0];
  if (!entry) return res.sendStatus(200);

  // 🔴 إصلاح: الرد الفوري لـ Meta (200 OK) حتى لا تعيد الإرسال
  res.sendStatus(200);

  // معالجة الرسائل في الخلفية
  if (entry.changes?.[0]?.value?.messages) {
    const v = entry.changes[0].value;
    const phone_number_id = v.metadata.phone_number_id;

    // 🔴 إصلاح: المرور على كل الرسائل في الطلب
    for (const msg of v.messages) {
      if (msg.type !== 'text') continue; // تجاهل الصور والصوت حالياً

      const from = msg.from;
      const text = msg.text?.body || '';

      const clinicId = await resolveClinicId({ channel: 'whatsapp', externalId: phone_number_id });
      if (clinicId) {
        // لا ننتظر (await) هنا لكي لا نعطل الـ Webhook
        handleIncoming({ clinicId, channel: 'whatsapp', from, text }).catch(console.error);
      }
    }
  }
}));

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) return res.send(req.query['hub.challenge']);
  res.sendStatus(403);
});

// ============================================
// REST APIs
// ============================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// صفحات الويب
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web', 'terms.html')));
app.get('/data-deletion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'web', 'data-deletion.html')));

app.get('/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, mode: TENANCY_MODE, version: '3.5' });
}));

// Reception
function requireReception(req, res, next) {
  if (req.headers['x-reception-token'] !== RECEPTION_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/api/reception/book', requireReception, requireActiveSubscription('reception'), asyncHandler(async (req, res) => {
  const clinicId = req.headers['x-clinic-id'] || process.env.CLINIC_ID;
  const { patient_name, patient_phone, date, time, service } = req.body;
  if (!patient_name || !patient_phone || !date || !time) return res.status(400).json({ error: 'missing fields' });

  const r = await bookWithLock({ clinic_id: clinicId, patient_name, patient_phone, date, time, source: 'reception', service: service || 'عام' });
  if (r.ok) return res.json({ success: true, booking: r.booking });
  res.status(409).json({ success: false, error: r.error });
}));

// 🔴 إصلاح: حماية الـ Deposit من التلاعب بالمبلغ
app.post('/api/pay/deposit', requireReception, requireActiveSubscription('deposit'), asyncHandler(async (req, res) => {
  const clinicId = req.headers['x-clinic-id'] || process.env.CLINIC_ID;
  const { booking_id } = req.body;
  const b = await pool.query('SELECT * FROM bookings WHERE id=$1 AND clinic_id=$2', [booking_id, clinicId]);
  if (!b.rows[0]) return res.status(404).json({ error: 'not found' });

  const ctx = await getClinicContext(clinicId);
  // 🔴 نأخذ المبلغ من إعدادات العيادة فقط
  const amount = ctx.deposit.amount_sar;

  try {
    const payUrl = await createDepositInvoice({
      clinicId, bookingId: booking_id, amount,
      moyasarKey: ctx.deposit.moyasar_key,
      callbackUrl: `${PUBLIC_URL}/api/pay/callback`
    });
    res.json({ payment_url: payUrl });
  } catch (e) {
    res.status(500).json({ error: 'payment init failed' });
  }
}));

app.get('/api/central/stats', requireReception, asyncHandler(async (req, res) => {
  const clinicId = req.headers['x-clinic-id'] || process.env.CLINIC_ID;
  const [today, total, wa, ig] = await Promise.all([
    pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND date=CURRENT_DATE`, [clinicId]),
    pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1`, [clinicId]),
    pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='whatsapp'`, [clinicId]),
    pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='instagram'`, [clinicId])
  ]);
  res.json({
    bookings_today: parseInt(today.rows[0].c),
    bookings_total: parseInt(total.rows[0].c),
    whatsapp: parseInt(wa.rows[0].c),
    instagram: parseInt(ig.rows[0].c)
  });
}));

// Global Error Handler (لأي خطأ غير متوقع)
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ============================================
// CRON Jobs
// ============================================
cron.schedule('*/10 * * * *', async () => {
  const r = await pool.query(`
        SELECT * FROM bookings
        WHERE date=CURRENT_DATE AND status='confirmed' AND reminder_sent=FALSE
          AND (date + time) BETWEEN (NOW() + INTERVAL '2 hours 50 minutes') AND (NOW() + INTERVAL '3 hours 10 minutes')
    `);
  for (const b of r.rows) {
    const ctx = await getClinicContext(b.clinic_id);
    if (!ctx || ctx.features.reminder_3h === false) continue;
    await sendToChannel(ctx, 'whatsapp', b.patient_phone, `تذكير: موعدك اليوم الساعة ${b.time}.`, {
      template: { name: 'appointment_reminder_3h', language: { code: 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: b.time }] }] }
    });
    await pool.query('UPDATE bookings SET reminder_sent=TRUE WHERE id=$1', [b.id]);
  }
});

// 🔴 إصلاح: عدم تحويل الحجوزات "المكتملة" إلى غياب
cron.schedule('0 * * * *', async () => {
  await pool.query(`
        UPDATE bookings SET status='no_show', updated_at=NOW()
        WHERE date=CURRENT_DATE AND status='confirmed' 
          AND (date + time) < (NOW() - INTERVAL '2 hours')
    `);
});

const server = app.listen(3000, () => console.log(`[READY] Bot v3.5 on :3000`));

async function shutdown() {
  server.close();
  await closeQueue();
  try { await stateConn?.quit(); } catch { }
  try { await pool.end(); } catch { }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);