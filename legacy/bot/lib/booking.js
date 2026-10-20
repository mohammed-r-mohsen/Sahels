// bot/lib/booking.js
const { pool } = require('./db');

async function bookWithLock({ clinic_id, patient_phone, patient_name, date, time, source, service }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory lock لمنع التضارب
    const lockKey = Math.abs(
      `${clinic_id}|${date}|${time}`.split('')
        .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
    );
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    // فحص التضارب
    const dup = await client.query(
      `SELECT id FROM bookings
       WHERE clinic_id=$1 AND date=$2 AND time=$3
         AND status IN ('pending','confirmed')
       FOR UPDATE`,
      [clinic_id, date, time]
    );

    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        error: `الموعد ${time} محجوز. اختر وقتاً آخر.`
      };
    }

    // إدراج
    const ins = await client.query(
      `INSERT INTO bookings
         (clinic_id, patient_phone, patient_name, date, time, service, source, status, consent_given)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',TRUE)
       RETURNING *`,
      [clinic_id, patient_phone, patient_name, date, time, service, source]
    );

    await client.query('COMMIT');
    return { ok: true, booking: ins.rows[0] };

  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return {
        ok: false,
        error: `الموعد ${time} محجوز بالفعل.`
      };
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { bookWithLock };