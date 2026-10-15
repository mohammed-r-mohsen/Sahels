const fetch = require('node-fetch');
const { Pool } = require('pg');

const CLINIC_ID = process.env.CLINIC_ID;
const CENTRAL_URL = process.env.CENTRAL_URL;
const API_KEY = process.env.REGISTRATION_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

async function getStats() {
    if (!pool || !CLINIC_ID) return { bookings_today: 0, bookings_total: 0, whatsapp: 0, instagram: 0 };
    try {
        const [t, tot, wa, ig] = await Promise.all([
            pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND date=CURRENT_DATE`, [CLINIC_ID]),
            pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1`, [CLINIC_ID]),
            pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='whatsapp'`, [CLINIC_ID]),
            pool.query(`SELECT COUNT(*) c FROM bookings WHERE clinic_id=$1 AND source='instagram'`, [CLINIC_ID])
        ]);
        return {
            bookings_today: parseInt(t.rows[0].c),
            bookings_total: parseInt(tot.rows[0].c),
            whatsapp: parseInt(wa.rows[0].c),
            instagram: parseInt(ig.rows[0].c)
        };
    } catch (e) { console.error('[STATS]', e.message); return { bookings_today: 0, bookings_total: 0, whatsapp: 0, instagram: 0 }; }
}

async function register() {
    if (!CENTRAL_URL) return;
    try {
        const r = await fetch(`${CENTRAL_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                clinic_id: CLINIC_ID || 'multi',
                name: process.env.CLINIC_NAME || CLINIC_ID || 'multi',
                ip: 'auto',
                wa_phone_id: process.env.WA_PHONE_NUMBER_ID,
                instagram_id: process.env.INSTAGRAM_ID,
                version: '3.2'
            })
        });
        console.log('[REGISTER]', r.status);
    } catch (e) { console.error('[REGISTER]', e.message); }
}

async function heartbeat() {
    if (!CENTRAL_URL || !CLINIC_ID) return;
    try {
        const stats = await getStats();
        const r = await fetch(`${CENTRAL_URL}/api/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ clinic_id: CLINIC_ID, ...stats, server_stats: { uptime: process.uptime(), mem: process.memoryUsage().rss } })
        });
        console.log('[HB]', r.status);
    } catch (e) { console.error('[HB]', e.message); }
}

(async () => {
    console.log(`Agent v3.2 for ${CLINIC_ID || 'multi'}`);
    await register();
    await heartbeat();
    setInterval(heartbeat, 5 * 60 * 1000);
})();