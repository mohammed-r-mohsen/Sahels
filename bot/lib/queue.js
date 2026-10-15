const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const { isMulti } = require('./tenancy');

let connection, whatsappQueue, igQueue, whatsappWorker, igWorker;

function initQueue() {
    if (!process.env.REDIS_URL) {
        console.log('[QUEUE] Redis not configured, using direct send');
        return;
    }
    connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || (isMulti() ? '20' : '5'), 10);
    const rateMax = parseInt(process.env.QUEUE_RATE_MAX || (isMulti() ? '50' : '10'), 10);
    const rateDuration = parseInt(process.env.QUEUE_RATE_DURATION || '1000', 10);

    whatsappQueue = new Queue('whatsapp', { connection, limiter: { max: rateMax, duration: rateDuration } });
    igQueue = new Queue('instagram', { connection, limiter: { max: rateMax, duration: rateDuration } });

    whatsappWorker = new Worker('whatsapp', async job => {
        if (job.data.type === 'deposit_expiry') {
            const { pool } = require('./db');
            const { getClinicContext } = require('./features');
            const { sendWhatsApp } = require('./sender');
            const { bookingId, clinicId, phone } = job.data;
            const b = await pool.query('SELECT * FROM bookings WHERE id=$1', [bookingId]);
            if (!b.rows[0] || b.rows[0].status !== 'pending') return;
            await pool.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [bookingId]);
            await pool.query("UPDATE payments SET status='failed' WHERE booking_id=$1 AND status='pending'", [bookingId]);
            const ctx = await getClinicContext(clinicId);
            if (ctx) {
                await sendWhatsApp({
                    phoneId: ctx.wa_phone_id, token: ctx.wa_token, to: phone,
                    text: '⏱️ انتهت صلاحية حجزك لعدم الدفع. يمكنك إعادة الحجز في أي وقت.'
                });
            }
            return;
        }
        const { phone_id, token, payload } = job.data;
        await axios.post(
            `https://graph.facebook.com/v20.0/${phone_id}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
    }, { connection, concurrency });

    igWorker = new Worker('instagram', async job => {
        const { ig_user_id, token, payload } = job.data;
        await axios.post(
            `https://graph.facebook.com/v20.0/${ig_user_id}/messages?access_token=${token}`,
            payload,
            { timeout: 15000 }
        );
    }, { connection, concurrency });

    whatsappWorker.on('failed', (job, err) => console.error('[WA FAIL]', job.id, err.message));
    igWorker.on('failed', (job, err) => console.error('[IG FAIL]', job.id, err.message));
    console.log(`[QUEUE] ready mode=${isMulti() ? 'multi' : 'single'}`);
}

async function closeQueue() {
    try { await whatsappQueue?.close(); } catch { }
    try { await igQueue?.close(); } catch { }
    try { await whatsappWorker?.close(); } catch { }
    try { await igWorker?.close(); } catch { }
    try { await connection?.quit(); } catch { }
}

module.exports = {
    initQueue, closeQueue,
    getWhatsappQueue: () => whatsappQueue,
    getIgQueue: () => igQueue
};