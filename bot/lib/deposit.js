const axios = require('axios');
const { pool } = require('./db');
const { getWhatsappQueue } = require('./queue');

async function createDepositInvoice({ clinicId, bookingId, amount, moyasarKey, callbackUrl }) {
    try {
        const r = await axios.post('https://api.moyasar.com/v1/invoices', {
            amount: Math.round(amount * 100),
            currency: 'SAR',
            description: `عربون حجز #${bookingId} - ${clinicId}`,
            callback_url: `${callbackUrl}?booking_id=${bookingId}&clinic_id=${clinicId}`,
            metadata: { clinic_id: clinicId, booking_id: String(bookingId) }
        }, {
            auth: { username: moyasarKey, password: '' },
            timeout: 15000
        });

        await pool.query(`
      INSERT INTO payments (clinic_id, booking_id, moyasar_id, amount_sar, status, payment_url, raw_response)
      VALUES ($1,$2,$3,$4,'pending',$5,$6)
    `, [clinicId, bookingId, r.data.id, amount, r.data.url, JSON.stringify(r.data)]);

        await pool.query(`UPDATE bookings SET deposit_payment_id=$1 WHERE id=$2`, [r.data.id, bookingId]);

        return r.data.url;
    } catch (e) {
        console.error('[DEPOSIT]', e.response?.data || e.message);
        throw new Error('payment_init_failed');
    }
}

async function scheduleDepositExpiry(bookingId, clinicId, phone, channel) {
    const queue = getWhatsappQueue();
    if (!queue) return;
    await queue.add(
        `deposit-expiry-${bookingId}`,
        { type: 'deposit_expiry', bookingId, clinicId, phone, channel },
        { delay: 30 * 60 * 1000, jobId: `exp-${bookingId}`, removeOnComplete: true }
    );
}

module.exports = { createDepositInvoice, scheduleDepositExpiry };