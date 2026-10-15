// bot/lib/ai-tools.js
// تنفيذ أدوات المساعد الذكي. تُمرَّر bookWithLock و pool بالحقن لتفادي الاستيراد الدائري.

function createToolExecutor({ pool, bookWithLock }) {
  // ترتيب الموعد القادم: لم يبدأ بعد، وحالته فعّالة
  const UPCOMING = `status IN ('pending','confirmed') AND (date + time) > NOW()`;

  return async function executeTool(name, args, { clinicId, from, channel }) {
    // ----- حجز -----
    if (name === 'book_appointment') {
      const r = await bookWithLock({
        clinic_id: clinicId,
        patient_phone: from,
        patient_name: args.patient_name,
        date: args.date,
        time: args.time,
        source: channel,
        service: args.service
      });
      return r.ok
        ? { success: true, booking_id: r.booking.id, date: args.date, time: args.time }
        : { success: false, error: r.error };
    }

    // ----- عرض المواعيد -----
    if (name === 'get_my_appointments') {
      const where = args.include_past
        ? `clinic_id=$1 AND patient_phone=$2`
        : `clinic_id=$1 AND patient_phone=$2 AND ${UPCOMING}`;
      const r = await pool.query(
        `SELECT id, date::text AS date, to_char(time,'HH24:MI') AS time, service, status
           FROM bookings WHERE ${where}
          ORDER BY date DESC, time DESC LIMIT 20`,
        [clinicId, from]
      );
      return { appointments: r.rows };
    }

    // ----- إلغاء (موعد محدد فقط، بدون حذف فعلي) -----
    if (name === 'cancel_appointment') {
      const params = [clinicId, from];
      let extra = '';
      if (args.date) { params.push(args.date); extra = ' AND date=$3::date'; }

      const found = await pool.query(
        `SELECT id, date::text AS date, to_char(time,'HH24:MI') AS time, service
           FROM bookings
          WHERE clinic_id=$1 AND patient_phone=$2 AND ${UPCOMING}${extra}
          ORDER BY date, time`,
        params
      );

      if (found.rows.length === 0) return { success: false, error: 'no_upcoming_appointment' };
      if (found.rows.length > 1) {
        // لا نخمّن أيها يريد
        return { success: false, needs_date: true, appointments: found.rows };
      }

      const b = found.rows[0];
      await pool.query(
        `UPDATE bookings SET status='cancelled', updated_at=NOW()
          WHERE id=$1 AND clinic_id=$2 AND patient_phone=$3`,
        [b.id, clinicId, from]
      );
      await pool.query(
        'INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)',
        [clinicId, 'booking_cancelled_by_ai', JSON.stringify({ booking_id: b.id, channel })]
      ).catch(() => { });
      return { success: true, cancelled: b };
    }

    // ----- تحويل لموظف -----
    if (name === 'escalate_to_human') {
      await pool.query(
        'INSERT INTO access_logs (clinic_id, action, details) VALUES ($1,$2,$3)',
        [clinicId, 'ai_escalation', JSON.stringify({ channel, reason: args.reason })]
      ).catch(() => { });
      return { success: true, message: 'تم تسجيل طلب التحويل' };
    }

    return { success: false, error: 'unknown_tool' };
  };
}

module.exports = { createToolExecutor };