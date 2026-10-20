export const clinicMetrics = [
  { label: "التذكيرات المرسلة", value: "423", progress: 82 },
  { label: "الرسائل الناجحة", value: "389", progress: 76 },
  { label: "الفشل/التأخير", value: "34", progress: 18 },
];

export const appointmentRows = [
  { time: "09:00", patient: "سارة الحربي", doctor: "د. سعد الزهراني", status: "مؤكد", channel: "واتساب" },
  { time: "09:30", patient: "عبدالله القرني", doctor: "د. نهى الناصر", status: "قائمة انتظار", channel: "إنستغرام" },
  { time: "10:15", patient: "أحمد الخالد", doctor: "د. عبدالرحمن العتيبي", status: "مؤكد", channel: "مراجعة مباشرة" },
  { time: "11:00", patient: "ريم السهلي", doctor: "د. سارة الحربي", status: "ملغي", channel: "واتساب" },
  { time: "13:00", patient: "محمود الشمري", doctor: "د. نهى الناصر", status: "منجزة", channel: "واتساب" },
];

export const doctorRows = [
  { name: "د. سارة الحربي", specialty: "تقويم", clinic: "عيادة الشروق", status: "نشط", slots: "08:00-17:00" },
  { name: "د. عبدالله الزهراني", specialty: "زراعة", clinic: "عيادة الشروق", status: "نشط", slots: "09:00-18:00" },
  { name: "د. نهى الناصر", specialty: "تجميل", clinic: "عيادة النخيل", status: "مستريح", slots: "10:00-16:00" },
  { name: "د. محمد العتيبي", specialty: "علاج جذور", clinic: "عيادة النخيل", status: "نشط", slots: "08:30-15:30" },
];

export const recentPatients = [
  { name: "فاطمة الميمني", lastVisit: "2026-10-18", notes: "تحتاج متابعة بعد التركيب" },
  { name: "ياسر الدوسري", lastVisit: "2026-10-17", notes: "مراجعة متابعة على العلاج" },
  { name: "نجلاء التميمي", lastVisit: "2026-10-16", notes: "تحديد موعد للفحص" },
];

export const waitlistRows = [
  { patient: "أسماء القحطاني", doctor: "د. نهى الناصر", priority: 1, waitTime: "1h 15m", status: "متاح" },
  { patient: "حسن الشايع", doctor: "د. سارة الحربي", priority: 2, waitTime: "45m", status: "قيد الانتظار" },
  { patient: "رنا الغامدي", doctor: "د. محمد العتيبي", priority: 3, waitTime: "30m", status: "جديد" },
];

export const reportRows = [
  { period: "سبتمبر", bookings: 420, attendance: "94%", noShow: "6%", revenue: "SAR 27,500" },
  { period: "أكتوبر", bookings: 468, attendance: "96%", noShow: "4%", revenue: "SAR 31,800" },
  { period: "نوفمبر", bookings: 396, attendance: "95%", noShow: "5%", revenue: "SAR 29,450" },
];

export const patientRows = [
  { name: "سارة الحربي", phone: "9665xxxxxx", lastVisit: "2026-10-18", visits: 6, risk: "منخفض" },
  { name: "عبدالله القرني", phone: "9665xxxxxx", lastVisit: "2026-10-16", visits: 4, risk: "متوسط" },
  { name: "حصة السعدي", phone: "9665xxxxxx", lastVisit: "2026-10-15", visits: 9, risk: "منخفض" },
  { name: "راشد العمر", phone: "9665xxxxxx", lastVisit: "2026-10-14", visits: 3, risk: "مرتفع" },
];
