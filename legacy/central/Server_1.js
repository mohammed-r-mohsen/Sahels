const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cron = require('node-cron');
const { pool } = require('./lib/db');
const { sendMonthlyReport } = require('./lib/reporter');

const app = express();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const REGISTRATION_KEY = process.env.REGISTRATION_KEY || 'change-me';

app.use(cors());
app.use(bodyParser.json());

app.get('/health', (_, res) => res.json({ ok: true, version: '3.2' }));

app.post('/api/register', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== REGISTRATION_KEY) return res.status(401).json({ error: 'invalid registration key' });
    const { clinic_id, name, ip, wa_phone_id, instagram_id, version } = req.body;
    if (!clinic_id) return res.status(400).json({ error: 'clinic_id required' });

    const apiKeyHash = crypto.createHash('sha256').update(`${clinic_id}:${REGISTRATION_KEY}`).digest('hex');

    await pool.query(`
    INSERT INTO central_clinics (clinic_id, name, ip, api_key_hash, wa_phone_id, instagram_id, status, last_seen, version)
    VALUES ($1,$2,$3,$4,$5,$6,'online',NOW(),$7)
    ON CONFLICT (clinic_id) DO UPDATE SET
      name=EXCLUDED.name, ip=EXCLUDED.ip, wa_phone_id=EXCLUDED.wa_phone_id,
      instagram_id=EXCLUDED.instagram_id, status='online', last_seen=NOW(), version=EXCLUDED.version
  `, [clinic_id, name, ip, apiKeyHash, wa_phone_id, instagram_id, version || '3.2']);
    res.json({ ok: true });
});

app.post('/api/heartbeat', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'missing key' });
    const { clinic_id, bookings_today, bookings_total, whatsapp, instagram, server_stats } = req.body;
    const expected = crypto.createHash('sha256').update(`${clinic_id}:${REGISTRATION_KEY}`).digest('hex');
    if (apiKey !== expected) return res.status(403).json({ error: 'bad key' });

    const r = await pool.query(`
    UPDATE central_clinics SET
      status='online', last_seen=NOW(),
      bookings_today=$2, bookings_total=$3, whatsapp=$4, instagram=$5, server_stats=$6
    WHERE clinic_id=$1 RETURNING clinic_id
  `, [clinic_id, bookings_today || 0, bookings_total || 0, whatsapp || 0, instagram || 0, server_stats || {}]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not registered' });
    res.json({ ok: true });
});

setInterval(async () => {
    try {
        await pool.query(`UPDATE central_clinics SET status='offline' WHERE last_seen < NOW() - INTERVAL '10 minutes'`);
    } catch (e) { }
}, 60 * 1000);

function requireAdmin(req, res, next) {
    if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    next();
}

app.get('/api/clinics', requireAdmin, async (_, res) => {
    const r = await pool.query('SELECT clinic_id, name, ip, status, last_seen, bookings_today, bookings_total, whatsapp, instagram, version FROM central_clinics ORDER BY last_seen DESC NULLS LAST');
    res.json(r.rows);
});

app.post('/api/reports/generate-now', requireAdmin, async (req, res) => {
    try {
        await sendMonthlyReport();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

cron.schedule('0 8 1 * *', async () => {
    console.log('[REPORT] Monthly cron starting...');
    try { await sendMonthlyReport(); }
    catch (e) { console.error('[REPORT]', e.message); }
}, { timezone: 'Asia/Riyadh' });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Central v3.2 on :${PORT}`));