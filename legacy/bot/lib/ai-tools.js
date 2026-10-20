// bot/lib/ai-tools.js
// v3.5 - نظام الأطباء + حساب السعة تلقائياً
// الإصلاحات:
//  - إزالة generateSlots المكررة
//  - إضافة bookAppointment المفقودة
//  - دعم capacity ديناميكي من جدول الأطباء
//  - ربط الحجز بطبيب تلقائياً

// ============================================
// احتياطي فقط عندما لا يوجد أطباء في DB
// ============================================
const FALLBACK_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
];

// ============================================
// توليد الأوقات من start/end/duration
// ============================================
function generateSlots(startTime, endTime, durationMin) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let cur = sh * 60 + sm;
  const end = eh * 60 + em;
  while (cur + durationMin <= end) {
    const hh = String(Math.floor(cur / 60)).padStart(2, '0');
    const mm = String(cur % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    cur += durationMin;
  }
  return slots;
}

// ============================================
// السعة = عدد الأطباء النشطين في كل وقت
// ============================================
async function getSlotsForDate(pool, clinicId, date) {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

  try {
    // 1. اجلب كل جداول الأطباء النشطين في هذا اليوم
    const r = await pool.query(`
      SELECT
        ds.start_time,
        ds.end_time,
        ds.slot_duration_minutes,
        d.id   AS doctor_id,
        d.full_name
      FROM doctor_schedules ds
      INNER JOIN doctors d ON d.id = ds.doctor_id
      WHERE ds.clinic_id = $1
        AND ds.day_of_week = $2
        AND ds.is_active = TRUE
        AND d.is_active = TRUE
        AND (d.left_at IS NULL OR d.left_at > $3)
      ORDER BY ds.start_time, d.id
    `, [clinicId, dayOfWeek, date]);

    // لا يوجد أطباء → العيادة مغلقة
    if (r.rows.length === 0) {
      return {
        slots: [],
        message: 'العيادة مغلقة في هذا اليوم أو لا يوجد أطباء متاحون.'
      };
    }

    // 2. لكل وقت، احسب عدد الأطباء المتاحين فيه
    const slotMap = new Map(); // "HH:MM" → { time, capacity, doctors: [] }

    for (const row of r.rows) {
      const times = generateSlots(
        String(row.start_time).slice(0, 5),
        String(row.end_time).slice(0, 5),
        row.slot_duration_minutes
      );
      for (const t of times) {
        if (!slotMap.has(t)) {
          slotMap.set(t, { time: t, capacity: 0, doctors: [] });
        }
        const entry = slotMap.get(t);
        entry.capacity += 1;
        entry.doctors.push({ id: row.doctor_id, name: row.full_name });
      }
    }

    // 3. رتّب الأوقات
    const slots = Array.from(slotMap.values()).sort((a, b) =>
      a.time.localeCompare(b.time)
    );

    return { slots, message: null };
  } catch (e) {
    console.error('[getSlotsForDate]', e.message);
    return { slots: [], message: 'تعذّر جلب المواعيد' };
  }
}

// ============================================
// المصنع الرئيسي
// ============================================
function createToolExecutor({ pool, bookWithLock }) {
  if (!pool || !bookWithLock) {
    throw new Error('createToolExecutor: pool and bookWithLock are required');
  }

  // ============================================
  // check_availability - فحص المواعيد المتاحة
  // ============================================
  async function checkAvailability({ clinicId, args }) {
    const { date } = args;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: 'صيغة التاريخ غير صحيحة', error_code: 'INVALID_DATE' };
    }

    try {
      const result = await getSlotsForDate(pool, clinicId, date);
      const slots = result.slots;

      if (slots.length === 0) {
        return {
          success: true,
          date,
          available_slots: [],
          full_slots: [],
          total_available: 0,
          message: result.message || 'لا توجد مواعيد متاحة'
        };
      }

      // اجلب الحجوزات الحالية
      const r = await pool.query(
        `SELECT time, COUNT(*) AS booked
         FROM bookings
         WHERE clinic_id=$1 AND date=$2
           AND status IN ('pending','confirmed')
         GROUP BY time`,
        [clinicId, date]
      );

      const bookedCount = new Map();
      for (const row of r.rows) {
        bookedCount.set(String(row.time).slice(0, 5), parseInt(row.booked, 10));
      }

      const available = [];
      const fullSlots = [];

      for (const s of slots) {
        const booked = bookedCount.get(s.time) || 0;
        if (booked < s.capacity) {
          available.push({
            time: s.time,
            capacity: s.capacity,
            booked,
            remaining: s.capacity - booked
          });
        } else {
          fullSlots.push(s.time);
        }
      }

      return {
        success: true,
        date,
        available_slots: available.map(s => s.time),
        available_details: available,
        full_slots: fullSlots,
        total_available: available.length,
        total_full: fullSlots.length
      };
    } catch (e) {
      console.error('[TOOL check_availability]', e.message);
      return { success: false, error: 'فشل فحص المواعيد' };
    }
  }

  // ============================================
  // book_appointment - حجز موعد (مع السعة الديناميكية)
  // ============================================
  async function bookAppointment({ clinicId, from, channel, args }) {
    const { patient_name, date, time, service } = args;

    // 1. التحقق من المدخلات
    if (!patient_name || !date || !time || !service) {
      return { success: false, error: 'بيانات ناقصة', error_code: 'MISSING_FIELDS' };
    }

    // 2. افحص أن الوقت ضمن مواعيد العمل + اعرف السعة
    const result = await getSlotsForDate(pool, clinicId, date);
    const slotInfo = result.slots.find(s => s.time === time);

    if (!slotInfo) {
      return {
        success: false,
        error: `${time} ليس ضمن مواعيد العمل`,
        error_code: 'OUT_OF_HOURS'
      };
    }

    // 3. ابحث عن طبيب متاح (لم يُحجز معه في نفس الوقت)
    let assignedDoctorId = null;
    try {
      const busyDocs = await pool.query(
        `SELECT DISTINCT doctor_id FROM bookings
         WHERE clinic_id=$1 AND date=$2 AND time=$3
           AND status IN ('pending','confirmed')
           AND doctor_id IS NOT NULL`,
        [clinicId, date, time]
      );
      const busySet = new Set(busyDocs.rows.map(r => r.doctor_id));
      const availableDoc = slotInfo.doctors.find(d => !busySet.has(d.id));
      if (availableDoc) assignedDoctorId = availableDoc.id;
    } catch (e) {
      console.error('[bookAppointment] doctor lookup failed:', e.message);
    }

    // 4. حاول الحجز
    const r = await bookWithLock({
      clinic_id: clinicId,
      patient_phone: from,
      patient_name,
      date,
      time,
      source: channel || 'whatsapp',
      service,
      capacity: slotInfo.capacity,
      doctor_id: assignedDoctorId
    });

    if (r.ok) {
      return {
        success: true,
        booking_id: r.booking.id,
        date,
        time,
        service,
        doctor_id: assignedDoctorId,
        message: `تم حجز الموعد يوم ${date} الساعة ${time}`
      };
    }

    // 5. تضارب → اجلب البدائل
    try {
      const avail = await checkAvailability({ clinicId, args: { date } });
      const alternatives = (avail.available_slots || []).slice(0, 4);

      return {
        success: false,
        error: r.error,
        error_code: 'SLOT_TAKEN',
        conflicting_date: date,
        conflicting_time: time,
        alternative_slots: alternatives,
        message: alternatives.length > 0
          ? `الموعد ${time} ممتلئ. المتاح: ${alternatives.join('، ')}`
          : `الموعد ${time} ممتلئ ولا توجد بدائل في نفس اليوم. اختر يوماً آخر.`
      };
    } catch (e) {
      return {
        success: false,
        error: r.error,
        error_code: 'SLOT_TAKEN',
        conflicting_date: date,
        conflicting_time: time,
        alternative_slots: []
      };
    }
  }

  // ============================================
  // cancel_appointment - إلغاء موعد
  // ============================================
  async function cancelAppointment({ clinicId, from, args }) {
    const { date } = args || {};

    try {
      let query, params;
      if (date) {
        query = `DELETE FROM bookings
                 WHERE clinic_id=$1 AND patient_phone=$2 AND date=$3
                   AND status IN ('pending','confirmed')
                 RETURNING id, date, time`;
        params = [clinicId, from, date];
      } else {
        query = `DELETE FROM bookings
                 WHERE clinic_id=$1 AND patient_phone=$2 AND date>=CURRENT_DATE
                   AND status IN ('pending','confirmed')
                 RETURNING id, date, time`;
        params = [clinicId, from];
      }

      const r = await pool.query(query, params);

      if (r.rows.length === 0) {
        return {
          success: false,
          error: 'لا يوجد موعد قادم لإلغائه',
          error_code: 'NO_BOOKING'
        };
      }

      const c = r.rows[0];
      return {
        success: true,
        cancelled_count: r.rows.length,
        cancelled_date: c.date,
        cancelled_time: c.time,
        message: `تم إلغاء الموعد يوم ${c.date} الساعة ${c.time}`
      };
    } catch (e) {
      console.error('[TOOL cancel_appointment]', e.message);
      return { success: false, error: 'فشل الإلغاء' };
    }
  }

  // ============================================
  // get_my_appointments - عرض المواعيد
  // ============================================
  async function getMyAppointments({ clinicId, from, args }) {
    const { include_past = false } = args || {};
    try {
      const query = include_past
        ? `SELECT id, date, time, service, status FROM bookings
           WHERE clinic_id=$1 AND patient_phone=$2
           ORDER BY date DESC, time DESC LIMIT 20`
        : `SELECT id, date, time, service, status FROM bookings
           WHERE clinic_id=$1 AND patient_phone=$2 AND date>=CURRENT_DATE
             AND status IN ('pending','confirmed')
           ORDER BY date, time LIMIT 10`;
      const r = await pool.query(query, [clinicId, from]);
      return { success: true, count: r.rows.length, appointments: r.rows };
    } catch (e) {
      console.error('[TOOL get_my_appointments]', e.message);
      return { success: false, error: 'فشل جلب المواعيد' };
    }
  }

  // ============================================
  // escalate_to_human - التحويل لموظف
  // ============================================
  async function escalateToHuman({ clinicId, from, channel, args }) {
    const { reason } = args || {};
    try {
      await pool.query(
        `INSERT INTO access_logs (clinic_id, action, details)
         VALUES ($1, 'human_escalation', $2)`,
        [clinicId, JSON.stringify({
          from,
          channel,
          reason: reason || 'غير محدد',
          ts: new Date().toISOString()
        })]
      );
      return {
        success: true,
        message: `تم تحويلك لموظف. السبب: ${reason || 'غير محدد'}`
      };
    } catch (e) {
      console.error('[TOOL escalate_to_human]', e.message);
      return { success: true, message: 'تم التحويل' };
    }
  }

  // ============================================
  // Router
  // ============================================
  async function executeTool(name, args, context) {
    const { clinicId, from, channel } = context || {};
    switch (name) {
      case 'check_availability':
        return checkAvailability({ clinicId, args });
      case 'book_appointment':
        return bookAppointment({ clinicId, from, channel, args });
      case 'cancel_appointment':
        return cancelAppointment({ clinicId, from, args });
      case 'get_my_appointments':
        return getMyAppointments({ clinicId, from, args });
      case 'escalate_to_human':
        return escalateToHuman({ clinicId, from, channel, args });
      default:
        return { success: false, error: `unknown_tool: ${name}` };
    }
  }

  return executeTool;
}

module.exports = {
  createToolExecutor,
  getSlotsForDate,
  generateSlots,
  FALLBACK_SLOTS
};