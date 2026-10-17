// bot/Server_2.js
// الإصدار v3.3 - تحديث AI Agent مع check_availability + رسائل تضارب واضحة
process.env.TZ = 'Asia/Riyadh';

const crypto = require('crypto');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');
const IORedis = require('ioredis');

const { pool } = require('./lib/db');
const { initQueue, closeQueue, getWhatsappQueue } = require('./lib/queue');
const { resolveClinicId } = require('./lib/clinic-resolver');
const { sendWhatsApp, sendInstagram } = require('./lib/sender');
const { CONSENT_MSG, MEDICAL_DISCLAIMER, isEmergency, isMedical } = require('./lib/compliance');
const { isMulti, isSingle, getStaticClinicId, TENANCY_MODE } = require('./lib/tenancy');
const { getClinicContext, invalidateCache } = require('./lib/features');
const { checkAccess, requireActiveSubscription } = require('./lib/subscription-guard');
const { createDepositInvoice, scheduleDepositExpiry } = require('./lib/deposit');

// ============================================
// AI Agent imports
// ============================================
const { chatWithAI, clearHistory } = require('./lib/ai');
const { detectSensitivity } = require('./lib/sensitive');
const { createToolExecutor } = require('./lib/ai-tools');

const app = express();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'sahels_verify';
const META_APP_SECRET = process.env.META_APP_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const RECEPTION_TOKEN = process.env.RECEPTION_TOKEN || 'reception-secret';

console.log(`[BOOT] Sahels v3.3 mode=${TENANCY_MODE} clinic=${isSingle() ? getStaticClinicId() : 'multi'}`);

initQueue();

// ============================================
// State management (Redis)
// ============================================
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

// ============================================
// sendToChannel helper
// ============================================
async function sendToChannel(ctx, channel, to, text, opts = {}) {
  if (channel === 'instagram') {
    return sendInstagram({ igUserId: ctx.ig_id, token: ctx.ig_token, to, text });
  }
  return sendWhatsApp({ phoneId: ctx.wa_phone_id, token: ctx.wa_token, to, text, template: opts.template });
}

// ============================================
// bookWithLock - حجز آمن ضد التضارب
// ============================================
async function bookWithLock({ clinic_id, patient_phone, patient_name, date, time, source, service, capacity = 1 }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory lock لمنع التضارب
    const lockKey = Math.abs(
      `${clinic_id}|${date}|${time}`.split('')
        .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
    );
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    // عد الحجوزات الحالية في هذا الوقت
    const countRes = await client.query(
      `SELECT COUNT(*) AS c FROM bookings
             WHERE clinic_id=$1 AND date=$2 AND time=$3
               AND status IN ('pending','confirmed')`,
      [clinic_id, date, time]
    );
    const currentCount = parseInt(countRes.rows[0].c, 10);

    if (currentCount >= capacity) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        error: `الموعد ${time} ممتلئ (${currentCount}/${capacity}). اختر وقتاً آخر.`
      };
    }

    // إدراج الحجز
    const ins = await client.query(
      `INSERT INTO bookings
               (clinic_id, patient_phone, patient_name, date, time, service, source, status, consent_given, slot_capacity)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',TRUE,$8)
             RETURNING *`,
      [clinic_id, patient_phone, patient_name, date, time, service, source, capacity]
    );

    await client.query('COMMIT');
    return { ok: true, booking: ins.rows[0] };

  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return { ok: false, error: `الموعد ${time} محجوز.` };
    }
    throw e;
  } finally {
    client.release();
  }
}

// ============================================
// Tool Executor - معالج الأدوات
// ============================================
const executeTool = createToolExecutor({ pool, bookWithLock });

// ============================================
// handleIncoming - المعالج الرئيسي
// ============================================
async function handleIncoming({ clinicId, channel, from, text, phoneNumberId }) {
  const access = await checkAccess(clinicId, channel);
  if (!access.allowed) {
    console.log(`[BLOCKED] ${clinicId} channel=${channel} reason=${access.reason}`);
    const ctx = access.context;
    if (channel === 'whatsapp' && (ctx.wa_phone_id || phoneNumberId) && (ctx.wa_token || process.env.WA_TOKEN)) {
      try {
        await sendWhatsApp({
          phoneId: ctx.wa_phone_id || phoneNumberId,
          token: ctx.wa_token || process.env.WA_TOKEN,
          to: from,
          text: access.message
        });
      } catch (e) { /* silent */ }
    }
    return;
  }

  const ctx = access.context;

  // ============================================
  // 1. الاتفاقية (Terms & Conditions)
  // ============================================
  const consent = await pool.query(
    'SELECT 1 FROM consents WHERE clinic_id=$1 AND patient_ref=$2',
    [clinicId, from]
  );

  if (consent.rows.length === 0) {
    const CONSENT_TERMS = `👋 أهلاً بك في عيادة *${ctx.name || clinicId}*

أنا *ساهل* - مساعد ذكاء اصطناعي يعمل على مدار الساعة لخدمتك.

⚠️ *قبل أن نبدأ، يرجى الموافقة على الشروط:*

1️⃣ أنا مساعد ذكي، ولست طبيباً. لا أقدم نصائح طبية أو تشخيصاً.

2️⃣ في الحالات الطارئة، اتصل بـ *997* فوراً.

3️⃣ سيتم حفظ بياناتك (الاسم والجوال) لغرض الحجز فقط، لمدة سنتين، داخل المملكة العربية السعودية (نظام PDPL).

4️⃣ يمكنك طلب حذف بياناتك في أي وقت بكتابة "حذف بياناتي".

5️⃣ قد يتم تحويلك لموظف بشري عند الحاجة.

━━━━━━━━━━━━━━━━━━
للموافقة، أرسل: *موافق* ✅
للرفض، أرسل: *رفض*
━━━━━━━━━━━━━━━━━━`;

    const st = await getState(clinicId, channel, from);
    if (st.step !== 'awaiting_consent') {
      await sendToChannel(ctx, channel, from, CONSENT_TERMS);
      await setState(clinicId, channel, from, { step: 'awaiting_consent' });
      return;
    }

    if (text.trim() === 'رفض' || text.trim() === 'لا' || text.trim().toLowerCase() === 'no') {
      await sendToChannel(ctx, channel, from,
        'نأسف لسماع ذلك. لن نتمكن من مساعدتك بدون موافقتك على الشروط.\n\n' +
        'إذا غيّرت رأيك، أرسل "موافق" في أي وقت.\n\n' +
        'للتواصل المباشر مع العيادة، اتصل على الرقم الموضح في صفحتنا.');
      await clearState(clinicId, channel, from);
      return;
    }

    if (!text.includes('موافق') && !text.trim().toLowerCase().includes('agree')) {
      await sendToChannel(ctx, channel, from, 'الرجاء إرسال كلمة *موافق* للمتابعة، أو *رفض* للانصراف.');
      return;
    }

    // تم القبول
    await pool.query(
      'INSERT INTO consents (clinic_id, patient_ref, consent_text) VALUES ($1,$2,$3)',
      [clinicId, from, CONSENT_TERMS]
    );
    await clearState(clinicId, channel, from);

    await sendToChannel(ctx, channel, from,
      `✅ شكراً لك! تم تسجيل موافقتك.\n\n` +
      `كيف أقدر أساعدك اليوم؟\n\n` +
      `يمكنك:\n` +
      `• حجز موعد (مثلاً: "أبغى أحجز موعد بكرة الصبح")\n` +
      `• الاستفسار عن مواعيدك الحالية\n` +
      `• إلغاء أو تأجيل موعد\n` +
      `• السؤال عن خدماتنا وأسعارنا`
    );
    return;
  }

  // ============================================
  // 2. كشف المحتوى الحساس
  // ============================================
  const sensitivity = detectSensitivity(text);
  if (sensitivity.type !== 'safe') {
    console.log(`[SENSITIVE] ${sensitivity.type} from=${from} matched=${sensitivity.matched}`);

    await sendToChannel(ctx, channel, from, sensitivity.response);

    await pool.query(
      'INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)',
      [clinicId, `sensitive_${sensitivity.type}`, JSON.stringify({ from, channel, matched: sensitivity.matched })]
    ).catch(() => { });

    if (sensitivity.type === 'emergency') {
      clearHistory(clinicId, from);
    }
    return;
  }

  // ============================================
  // 3. معالجة أوامر خاصة
  // ============================================
  const lower = text.trim().toLowerCase();

  if (lower === 'الغاء' || lower === 'إلغاء' || lower === 'cancel') {
    const del = await pool.query(
      `DELETE FROM bookings WHERE clinic_id=$1 AND patient_phone=$2 AND date>=CURRENT_DATE RETURNING id, date, time`,
      [clinicId, from]
    );
    if (del.rows.length > 0) {
      const b = del.rows[0];
      await sendToChannel(ctx, channel, from, `✅ تم إلغاء موعدك يوم ${b.date} الساعة ${b.time}.\n\nنأمل رؤيتك قريباً!`);
      const next = await pool.query(
        'SELECT * FROM waiting_list WHERE clinic_id=$1 ORDER BY created_at LIMIT 1',
        [clinicId]
      );
      if (next.rows[0]) {
        const w = next.rows[0];
        await bookWithLock({
          clinic_id: clinicId, patient_phone: w.patient_phone, patient_name: w.patient_name,
          date: w.desired_date, time: '10:00', source: 'waiting', service: w.service
        });
        await sendToChannel(ctx, 'whatsapp', w.patient_phone, `🎉 صار موعد فاضي! حجزنا لك ${w.desired_date} 10:00`);
        await pool.query('DELETE FROM waiting_list WHERE id=$1', [w.id]);
      }
    } else {
      await sendToChannel(ctx, channel, from, 'ما لقيت لك أي موعد قادم لإلغائه.');
    }
    return;
  }

  if (lower.includes('حذف بياناتي') || lower.includes('delete my data')) {
    await pool.query('DELETE FROM consents WHERE clinic_id=$1 AND patient_ref=$2', [clinicId, from]);
    await pool.query('DELETE FROM bookings WHERE clinic_id=$1 AND patient_phone=$2', [clinicId, from]);
    clearHistory(clinicId, from);
    await sendToChannel(ctx, channel, from, '✅ تم حذف كل بياناتك من نظامنا حسب طلبك (حق الحذف - PDPL).\n\nنشكرك على ثقتك.');
    return;
  }

  if (lower.includes('موظف') || lower.includes('بشري') || lower.includes('human')) {
    await pool.query(
      'INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)',
      [clinicId, 'human_escalation', JSON.stringify({ from, channel })]
    ).catch(() => { });
    await sendToChannel(ctx, channel, from,
      '🔄 تم تحويلك لموظف بشري. سيتواصل معك في أقرب وقت.\n\nشكراً لصبرك.');
    return;
  }

  // ============================================
  // 4. AI Agent - المعالجة الرئيسية
  // ============================================
  try {
    const result = await chatWithAI({
      clinicId,
      from,
      userMessage: text,
      // ✅ onToolCall يستخدم executeTool المركزي
      // (يحتوي على check_availability + رسائل التضارب)
      onToolCall: async (name, args) => {
        return executeTool(name, args, { clinicId, from, channel });
      }
    });

    if (result.text) {
      await sendToChannel(ctx, channel, from, result.text);
    }

    // تسجيل محادثة AI
    await pool.query(
      'INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)',
      [clinicId, 'ai_chat', JSON.stringify({
        from,
        channel,
        tools_used: result.toolResults?.length || 0
      })]
    ).catch(() => { });

  } catch (e) {
    console.error('[AI ERROR]', e.message);
    await sendToChannel(ctx, channel, from,
      'عذراً، حدث خطأ تقني. حاول مرة أخرى، أو اكتب "موظف" للتحويل لموظف بشري.');
  }
}

// ============================================
// Webhook - WhatsApp + Instagram
// ============================================
app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    if (META_APP_SECRET) {
      const sig = req.headers['x-hub-signature-256'] || '';
      const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.body).digest('hex');
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return res.sendStatus(403);
      }
    }
    const body = JSON.parse(req.body.toString('utf8'));
    const entry = body.entry?.[0];
    if (!entry) return res.sendStatus(200);

    if (entry.changes?.[0]?.value?.messages) {
      const v = entry.changes[0].value;
      const phone_number_id = v.metadata.phone_number_id;
      const from = v.messages[0].from;
      const text = v.messages[0].text?.body || '';

      // WhatsApp Flow reply
      if (v.messages[0].type === 'interactive' && v.messages[0].interactive?.type === 'nfm_reply') {
        try {
          const flowData = JSON.parse(v.messages[0].interactive.nfm_reply.response_json);
          const clinicId = await resolveClinicId({ channel: 'whatsapp', externalId: phone_number_id, hostname: req.headers.host?.split(':')[0] });
          if (clinicId) {
            const access = await checkAccess(clinicId, 'whatsapp');
            if (access.allowed) {
              const r = await bookWithLock({
                clinic_id: clinicId, patient_phone: from,
                patient_name: flowData.patient_name,
                date: flowData.date, time: flowData.time,
                source: 'whatsapp_flow', service: flowData.service
              });
              const ctx = access.context;
              if (r.ok) {
                await sendToChannel(ctx, 'whatsapp', from, `✅ تم الحجز\n📅 ${flowData.date} ⏰ ${flowData.time}`);
              } else {
                await sendToChannel(ctx, 'whatsapp', from, `⚠️ ${r.error}`);
              }
            }
          }
        } catch (e) { console.error('[FLOW]', e.message); }
        return res.sendStatus(200);
      }

      const clinicId = await resolveClinicId({
        channel: 'whatsapp', externalId: phone_number_id,
        hostname: req.headers.host?.split(':')[0],
        headerClinicId: req.headers['x-clinic-id']
      });
      if (!clinicId) {
        console.error(`[WH] No clinic for wa phone_id=${phone_number_id}`);
        return res.sendStatus(200);
      }
      await handleIncoming({ clinicId, channel: 'whatsapp', from, text, phoneNumberId: phone_number_id });
      return res.sendStatus(200);
    }

    if (entry.messaging?.[0]) {
      const m = entry.messaging[0];
      if (m.message?.text) {
        const clinicId = await resolveClinicId({
          channel: 'instagram', externalId: m.recipient.id,
          hostname: req.headers.host?.split(':')[0],
          headerClinicId: req.headers['x-clinic-id']
        });
        if (!clinicId) {
          console.error(`[WH] No clinic for ig recipient=${m.recipient.id}`);
          return res.sendStatus(200);
        }
        await handleIncoming({ clinicId, channel: 'instagram', from: m.sender.id, text: m.message.text });
      }
      return res.sendStatus(200);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('[WEBHOOK]', e);
    res.sendStatus(200);
  }
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    // إجبار Meta على استلام النص كـ Plain Text لتجنب خطأ التحقق
    return res.type('text/plain').send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// ============================================
// Middleware
// ============================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Health check
// ============================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      mode: TENANCY_MODE,
      clinic: isSingle() ? getStaticClinicId() : 'multi',
      version: '3.3'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================
// Reception endpoints
// ============================================
function requireReception(req, res, next) {
  if (req.headers['x-reception-token'] !== RECEPTION_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

async function resolveReqClinic(req) {
  return resolveClinicId({
    hostname: req.headers.host?.split(':')[0],
    headerClinicId: req.headers['x-clinic-id'] || req.query.clinic
  });
}

app.post('/api/reception/book', requireReception, requireActiveSubscription('reception'), async (req, res) => {
  const clinicId = await resolveReqClinic(req);
  if (!clinicId) return res.status(400).json({ error: 'clinic not resolved' });
  const { patient_name, patient_phone, date, time, service } = req.body;
  if (!patient_name || !patient_phone || !date || !time) return res.status(400).json({ error: 'missing fields' });
  const r = await bookWithLock({ clinic_id: clinicId, patient_name, patient_phone, date, time, source: 'reception', service: service || 'عام' });
  if (r.ok) return res.json({ success: true, booking: r.booking });
  res.status(409).json({ success: false, error: r.error });
});

app.get('/api/reception/today', requireReception, requireActiveSubscription('reception'), async (req, res) => {
  const clinicId = await resolveReqClinic(req);
  if (!clinicId) return res.status(400).json({ error: 'clinic not resolved' });
  const r = await pool.query(
    `SELECT id, patient_name, patient_phone, time, service, status FROM bookings
         WHERE clinic_id=$1 AND date=CURRENT_DATE ORDER BY time`, [clinicId]);
  res.json(r.rows);
});

// ============================================
// QR endpoint
// ============================================
app.get('/api/qr', async (req, res) => {
  const clinicId = await resolveReqClinic(req);
  if (!clinicId) return res.status(400).json({ error: 'clinic not resolved' });
  const c = await pool.query('SELECT wa_number FROM clinics WHERE id=$1', [clinicId]);
  const num = (c.rows[0]?.wa_number || '').replace(/\D/g, '');
  res.json({ qr_text: `https://wa.me/${num}?text=${encodeURIComponent('بدي احجز')}`, clinic_id: clinicId });
});

// ============================================
// Deposit endpoints
// ============================================
app.post('/api/pay/deposit', requireActiveSubscription('deposit'), async (req, res) => {
  const clinicId = await resolveReqClinic(req);
  if (!clinicId) return res.status(400).json({ error: 'clinic not resolved' });
  const { booking_id, amount } = req.body;
  const b = await pool.query('SELECT * FROM bookings WHERE id=$1 AND clinic_id=$2', [booking_id, clinicId]);
  if (!b.rows[0]) return res.status(404).json({ error: 'not found' });
  const ctx = await getClinicContext(clinicId);
  try {
    const payUrl = await createDepositInvoice({
      clinicId, bookingId: booking_id,
      amount: amount || ctx.deposit.amount_sar,
      moyasarKey: ctx.deposit.moyasar_key,
      callbackUrl: `${PUBLIC_URL}/api/pay/callback`
    });
    res.json({ payment_url: payUrl });
  } catch (e) {
    res.status(500).json({ error: 'payment init failed' });
  }
});

app.get('/api/pay/callback', async (req, res) => {
  const { booking_id, clinic_id } = req.query;
  if (!booking_id || !clinic_id) return res.send('missing params');

  try {
    const ctx = await getClinicContext(clinic_id);
    const p = await pool.query('SELECT moyasar_id FROM payments WHERE booking_id=$1 AND clinic_id=$2 ORDER BY id DESC LIMIT 1', [booking_id, clinic_id]);
    if (p.rows[0] && ctx.deposit.moyasar_key) {
      const verify = await axios.get(`https://api.moyasar.com/v1/invoices/${p.rows[0].moyasar_id}`, {
        auth: { username: ctx.deposit.moyasar_key, password: '' }
      });
      if (verify.data.status === 'paid') {
        await pool.query("UPDATE bookings SET deposit_paid=TRUE, status='confirmed' WHERE id=$1 AND clinic_id=$2", [booking_id, clinic_id]);
        await pool.query("UPDATE payments SET status='paid', paid_at=NOW() WHERE booking_id=$1 AND clinic_id=$2", [booking_id, clinic_id]);
        const queue = getWhatsappQueue();
        if (queue) await queue.remove(`exp-${booking_id}`).catch(() => { });
        const b = await pool.query('SELECT * FROM bookings WHERE id=$1', [booking_id]);
        if (b.rows[0]) {
          await sendToChannel(ctx, 'whatsapp', b.rows[0].patient_phone,
            `✅ تم استلام العربون. حجزك مؤكد.\n📅 ${b.rows[0].date} ⏰ ${b.rows[0].time}`);
        }
        return res.send('✅ تم الدفع بنجاح. حجزك مؤكد.');
      }
    }
  } catch (e) { console.error('[CALLBACK]', e.message); }
  res.send('جاري التحقق من الدفع...');
});

// ============================================
// Central stats
// ============================================
app.get('/api/central/stats', async (req, res) => {
  try {
    const clinicId = await resolveReqClinic(req);
    if (!clinicId) return res.status(400).json({ error: 'clinic not resolved' });
    const [today, total, wa, ig] = await Promise.all([
      pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND date=CURRENT_DATE`, [clinicId]),
      pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1`, [clinicId]),
      pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='whatsapp'`, [clinicId]),
      pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='instagram'`, [clinicId])
    ]);
    res.json({
      clinic_id: clinicId,
      bookings_today: parseInt(today.rows[0].c),
      bookings_total: parseInt(total.rows[0].c),
      whatsapp: parseInt(wa.rows[0].c),
      instagram: parseInt(ig.rows[0].c)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// Admin: invalidate cache
// ============================================
app.post('/api/admin/invalidate-cache', (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const { clinic_id } = req.body || {};
  invalidateCache(clinic_id);
  res.json({ ok: true });
});

// ============================================
// CRON: 3h Reminder
// ============================================
// ============================================
// CRON: 3h Reminder - مع Template معتمد
// ============================================
cron.schedule('*/10 * * * *', async () => {
  try {
    const r = await pool.query(`
            SELECT b.*, c.name AS clinic_name, cp.address AS clinic_address
            FROM bookings b
            LEFT JOIN clinics c ON c.id = b.clinic_id
            LEFT JOIN clinic_profile cp ON cp.clinic_id = b.clinic_id
            WHERE b.date=CURRENT_DATE AND b.status='confirmed' AND b.reminder_sent=FALSE
              AND (b.date + b.time) BETWEEN (NOW() + INTERVAL '2 hours 50 minutes') AND (NOW() + INTERVAL '3 hours 10 minutes')
        `);

    for (const b of r.rows) {
      const ctx = await getClinicContext(b.clinic_id);
      if (!ctx || ctx.features.reminder_3h === false) continue;

      const params = [
        b.patient_name || 'المريض',
        b.clinic_name || 'العيادة',
        b.date.toISOString().slice(0, 10),
        String(b.time).slice(0, 5),
        b.clinic_address || 'موقع العيادة'
      ];

      await sendToChannel(ctx, 'whatsapp', b.patient_phone, null, {
        template: {
          name: 'appointment_reminder_3h',
          language: { code: 'ar' },
          components: [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: String(p) }))
          }]
        }
      });

      await pool.query('UPDATE bookings SET reminder_sent=TRUE WHERE id=$1', [b.id]);
      console.log(`[REMINDER] Sent to ${b.patient_phone} (booking #${b.id})`);
    }
  } catch (e) {
    console.error('[REMINDER]', e.message);
  }
});

// ============================================
// CRON: No-show
// ============================================
cron.schedule('0 * * * *', async () => {
  try {
    await pool.query(`
            UPDATE bookings SET status='no_show', updated_at=NOW()
            WHERE date=CURRENT_DATE AND status IN ('pending','confirmed')
              AND (date + time) < (NOW() - INTERVAL '2 hours')
        `);
  } catch (e) { console.error('[NOSHOW]', e.message); }
});

// ============================================
// CRON: Subscription expiry
// ============================================
cron.schedule('0 * * * *', async () => {
  try {
    const r = await pool.query(`
            UPDATE clinic_subscriptions
            SET status='expired', updated_at=NOW()
            WHERE status='active' AND ends_at <= NOW()
            RETURNING clinic_id
        `);
    if (r.rowCount > 0) {
      console.log(`[SUBS] Expired: ${r.rows.map(x => x.clinic_id).join(', ')}`);
      r.rows.forEach(x => invalidateCache(x.clinic_id));
    }
  } catch (e) { console.error('[SUBS CRON]', e.message); }
});

// ============================================
// CRON: Instagram token refresh
// ============================================
cron.schedule('0 3 * * *', async () => {
  try {
    const rows = isSingle()
      ? (process.env.INSTAGRAM_TOKEN ? [{ access_token: process.env.INSTAGRAM_TOKEN, external_id: process.env.INSTAGRAM_ID }] : [])
      : (await pool.query(`SELECT access_token, external_id FROM channel_identities WHERE channel='instagram'`)).rows;
    for (const c of rows) {
      if (!c.access_token) continue;
      try {
        const r = await axios.get(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${c.access_token}`);
        if (isMulti()) {
          await pool.query(`UPDATE channel_identities SET access_token=$1 WHERE channel='instagram' AND external_id=$2`, [r.data.access_token, c.external_id]);
        }
        console.log(`[IG REFRESH] ${c.external_id} ok`);
      } catch (e) { console.error(`[IG REFRESH] ${c.external_id}`, e.response?.data || e.message); }
    }
  } catch (e) { console.error('[IG CRON]', e.message); }
});

// ============================================
// CRON: PDPL Retention (حذف بعد سنتين)
// ============================================
cron.schedule('0 4 * * *', async () => {
  try {
    await pool.query(`DELETE FROM consents WHERE expires_at < NOW()`);
    await pool.query(`DELETE FROM bookings WHERE created_at < NOW() - INTERVAL '2 years'`);
  } catch (e) { console.error('[RETENTION]', e.message); }
});
// ============================================
// صفحات مؤقتة لمتطلبات Meta (سيتم تطويرها لاحقاً)
// ============================================
app.get('/privacy', (req, res) => {
  res.send('<h1>سياسة الخصوصية</h1><p>نحن نحترم خصوصيتك. سيتم تحديث هذه الصفحة قريباً.</p>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>شروط الخدمة</h1><p>سيتم تحديث هذه الصفحة قريباً.</p>');
});

app.get('/data-deletion', (req, res) => {
  res.send('<h1>حذف البيانات</h1><p>لحذف بياناتك، يرجى إرسال كلمة "حذف بياناتي" للبوت في واتساب.</p>');
});
// ============================================
// Start Server
// ============================================
const server = app.listen(3000, () => console.log(`[READY] Bot v3.3 mode=${TENANCY_MODE} on :3000`));

async function shutdown() {
  console.log('Shutting down...');
  server.close();
  await closeQueue();
  try { await stateConn?.quit(); } catch { }
  try { await pool.end(); } catch { }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
