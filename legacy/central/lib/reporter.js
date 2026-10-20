const { pool } = require('./db');
const { sendEmail } = require('./mailer');

async function buildMonthlyReport(referenceDate = new Date()) {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

    const clinics = await pool.query(`SELECT id, name FROM clinics`);

    const perClinic = [];
    for (const c of clinics.rows) {
        const stats = await pool.query(`
      WITH current_month AS (
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IN ('cancelled','no_show')) AS cancelled,
               COUNT(*) FILTER (WHERE source='whatsapp') AS wa,
               COUNT(*) FILTER (WHERE source='instagram') AS ig,
               COUNT(*) FILTER (WHERE source='reception') AS rc,
               COALESCE(SUM(CASE WHEN deposit_paid THEN 50 ELSE 0 END), 0) AS deposits
        FROM bookings
        WHERE clinic_id=$1 AND date BETWEEN $2 AND $3
      ),
      prev_month AS (
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IN ('cancelled','no_show')) AS cancelled
        FROM bookings
        WHERE clinic_id=$1 AND date BETWEEN $2::date - INTERVAL '1 month' AND $3::date - INTERVAL '1 month'
      )
      SELECT c.*, p.total AS prev_total
      FROM current_month c, prev_month p
    `, [c.id, start, end]);

        const s = stats.rows[0];
        const growth = parseInt(s.prev_total) > 0
            ? ((s.total - s.prev_total) / s.prev_total * 100).toFixed(1)
            : 'NEW';

        perClinic.push({
            clinic_id: c.id, name: c.name,
            bookings: parseInt(s.total), prev_bookings: parseInt(s.prev_total),
            growth, cancelled: parseInt(s.cancelled),
            cancellation_rate: s.total > 0 ? (s.cancelled / s.total * 100).toFixed(1) : 0,
            whatsapp: parseInt(s.wa), instagram: parseInt(s.ig),
            reception: parseInt(s.rc), deposits: parseFloat(s.deposits)
        });
    }

    perClinic.sort((a, b) => b.bookings - a.bookings);

    const totals = perClinic.reduce((acc, c) => ({
        bookings: acc.bookings + c.bookings,
        prev_bookings: acc.prev_bookings + c.prev_bookings,
        cancelled: acc.cancelled + c.cancelled,
        whatsapp: acc.whatsapp + c.whatsapp,
        instagram: acc.instagram + c.instagram,
        reception: acc.reception + c.reception,
        deposits: acc.deposits + c.deposits
    }), { bookings: 0, prev_bookings: 0, cancelled: 0, whatsapp: 0, instagram: 0, reception: 0, deposits: 0 });

    totals.growth = totals.prev_bookings > 0
        ? ((totals.bookings - totals.prev_bookings) / totals.prev_bookings * 100).toFixed(1)
        : 'NEW';
    totals.cancellation_rate = totals.bookings > 0
        ? (totals.cancelled / totals.bookings * 100).toFixed(1) : 0;

    await pool.query(`
    INSERT INTO report_history (report_type, period_start, period_end, total_bookings, total_cancelled, total_clinics, payload)
    VALUES ('monthly', $1, $2, $3, $4, $5, $6)
  `, [start, end, totals.bookings, totals.cancelled, perClinic.length, JSON.stringify({ totals, perClinic })]);

    return { period: { start, end }, totals, perClinic };
}

function renderReportHTML(report) {
    const { totals, perClinic } = report;
    return `
    <div dir="rtl" style="font-family:system-ui;max-width:700px;margin:auto">
      <h1>📊 تقرير Sahels الشهري</h1>
      <h2>🎯 الإجمالي (${perClinic.length} عيادة)</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td>إجمالي الحجوزات</td><td><b>${totals.bookings.toLocaleString()}</b></td></tr>
        <tr><td>النمو</td><td><b>${totals.growth}%</b></td></tr>
        <tr><td>واتساب</td><td>${totals.whatsapp}</td></tr>
        <tr><td>إنستغرام</td><td>${totals.instagram}</td></tr>
        <tr><td>Reception</td><td>${totals.reception}</td></tr>
        <tr><td>نسبة الإلغاء</td><td>${totals.cancellation_rate}%</td></tr>
      </table>
      <h2>🏥 تفصيل العيادات</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th>#</th><th>العيادة</th><th>حجوزات</th><th>النمو</th><th>إلغاء%</th></tr></thead>
        <tbody>
        ${perClinic.map((c, i) => `
          <tr>
            <td>${i + 1}</td><td>${c.name}</td><td>${c.bookings}</td>
            <td style="color:${String(c.growth).startsWith('-') ? 'red' : 'green'}">${c.growth}%</td>
            <td>${c.cancellation_rate}%</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function sendMonthlyReport() {
    const report = await buildMonthlyReport();
    const html = renderReportHTML(report);
    const subs = await pool.query(`SELECT * FROM report_subscriptions WHERE is_active=TRUE AND frequency='monthly'`);
    for (const sub of subs.rows) {
        if (sub.channel === 'email') {
            await sendEmail({
                to: sub.destination,
                subject: `📊 تقرير Sahels الشهري`,
                html
            });
        }
    }
    await pool.query(`UPDATE report_history SET sent_at=NOW() WHERE id=(SELECT MAX(id) FROM report_history)`);
    console.log(`[REPORT] Sent to ${subs.rowCount} subscribers`);
}

module.exports = { buildMonthlyReport, renderReportHTML, sendMonthlyReport };