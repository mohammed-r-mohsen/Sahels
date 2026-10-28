"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { CalendarDays, Plus, X } from "lucide-react";

type Doctor = { id: string; full_name: string; specialty: string | null; is_active: boolean };
type Appointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  starts_at: string;
  status: string;
  source: string;
  service: string | null;
};
type Patient = { id: string; full_name: string | null; phone: string };
type Slot = { starts_at: string; ends_at: string };

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر تنفيذ الطلب.";
}

function localDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function todayKey() {
  return localDateKey(new Date());
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ar-SA", {
    timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short",
  });
}

function statusName(status: string) {
  if (status === "confirmed") return "مؤكد";
  if (status === "pending") return "بانتظار التأكيد";
  if (status === "waiting") return "قائمة انتظار";
  if (status === "cancelled") return "ملغي";
  if (status === "completed") return "مكتمل";
  if (status === "no_show") return "لم يحضر";
  return status;
}

export default function AppointmentsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayKey);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [service, setService] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAppointments = useCallback(async () => {
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + 14);
    const query = new URLSearchParams({ from: now.toISOString(), to: until.toISOString() });
    setAppointments(await api<Appointment[]>(`/appointments?${query.toString()}`));
  }, []);

  useEffect(() => {
    Promise.all([api<Doctor[]>("/clinic/doctors"), loadAppointments(), api<Patient[]>("/patients")])
      .then(([doctorRows, , patientRows]) => {
        const activeDoctors = doctorRows.filter((doctor) => doctor.is_active);
        setDoctors(activeDoctors);
        setPatients(patientRows);
        setDoctorId(activeDoctors[0]?.id || "");
      })
      .catch((loadError: unknown) => setError(errorText(loadError)))
      .finally(() => setLoading(false));
  }, [loadAppointments]);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots([]);
      setStartsAt("");
      return;
    }
    let active = true;
    setStartsAt("");
    api<Slot[]>(`/appointments/availability?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`)
      .then((available) => { if (active) setSlots(available); })
      .catch((loadError: unknown) => { if (active) setError(errorText(loadError)); });
    return () => { active = false; };
  }, [doctorId, date]);

  async function createWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctorId || !startsAt) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api<Appointment>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId,
          patient_phone: patientPhone.trim(),
          patient_name: patientName.trim() || null,
          starts_at: startsAt,
          service: service.trim() || null,
          source: "walk_in",
        }),
      });
      await loadAppointments();
      setPatientName("");
      setPatientPhone("");
      setService("");
      setShowBooking(false);
      setNotice("تم تسجيل الحجز الحضوري.");
    } catch (createError: unknown) {
      setError(errorText(createError));
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
    setUpdating(appointmentId);
    setError("");
    try {
      await api(`/appointments/${appointmentId}/status`, {
        method: "PATCH", body: JSON.stringify({ status: "cancelled" }),
      });
      await loadAppointments();
    } catch (updateError: unknown) {
      setError(errorText(updateError));
    } finally {
      setUpdating("");
    }
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - day.getDay() + index);
    const key = localDateKey(day);
    return {
      key,
      label: day.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", weekday: "short" }),
      day: day.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" }),
      rows: appointments.filter((appointment) => localDateKey(new Date(appointment.starts_at)) === key),
    };
  });

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-bold text-sky-700">المواعيد</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">تقويم ومتابعة الحجوزات</h1>
          </div>
          <button type="button" className="btn-primary" onClick={() => setShowBooking((current) => !current)}>
            {showBooking ? <X className="ml-2 h-4 w-4" /> : <Plus className="ml-2 h-4 w-4" />}
            {showBooking ? "إغلاق" : "حجز حضوري"}
          </button>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        {showBooking && (
          <form onSubmit={createWalkIn} className="card space-y-5 p-5">
            <div>
              <h2 className="font-black text-slate-900">تسجيل مريض حضوري</h2>
              <p className="mt-1 text-sm text-slate-500">لا يظهر إلا موعد متاح للطبيب في التاريخ المختار.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">الطبيب
                <select required value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <option value="">اختر الطبيب</option>
                  {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}{doctor.specialty ? ` · ${doctor.specialty}` : ""}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">التاريخ
                <input required type="date" min={todayKey()} value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">الوقت المتاح
                <select required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" disabled={!slots.length}>
                  <option value="">{slots.length ? "اختر الوقت" : "لا توجد أوقات متاحة"}</option>
                  {slots.map((slot) => <option key={slot.starts_at} value={slot.starts_at}>{formatTime(slot.starts_at)}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">اسم المريض
                <input value={patientName} onChange={(event) => setPatientName(event.target.value)} maxLength={160} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">رقم الهاتف
                <input required type="tel" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} maxLength={32} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
              <label className="text-sm font-semibold text-slate-700">الخدمة
                <input value={service} onChange={(event) => setService(event.target.value)} maxLength={200} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" />
              </label>
            </div>
            <button type="submit" disabled={saving || !startsAt} className="btn-primary disabled:opacity-50">
              {saving ? "جارٍ تسجيل الحجز..." : "تأكيد الحجز"}
            </button>
          </form>
        )}

        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 p-5">
            <CalendarDays className="h-5 w-5 text-sky-700" />
            <h2 className="font-black text-slate-900">الأسبوع الحالي</h2>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 lg:grid-cols-7">
            {weekDays.map((day) => (
              <div key={day.key} className="min-h-32 p-3">
                <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">{day.label}</span>
                  <span className="text-slate-500">{day.day}</span>
                </div>
                <div className="space-y-1.5">
                  {day.rows.slice(0, 4).map((appointment) => (
                    <div key={appointment.id} className="truncate rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800" title={`${formatTime(appointment.starts_at)} · ${statusName(appointment.status)}`}>
                      {formatTime(appointment.starts_at)} · {statusName(appointment.status)}
                    </div>
                  ))}
                  {day.rows.length > 4 && <div className="text-xs text-slate-500">+{day.rows.length - 4} مواعيد</div>}
                  {!day.rows.length && <span className="text-xs text-slate-300">-</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="font-black text-slate-900">المواعيد القادمة</h2>
          </div>
          {loading ? <p className="p-5 text-sm text-slate-500">جارٍ تحميل المواعيد...</p> : appointments.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">لا توجد مواعيد خلال الأسبوعين القادمين.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="px-5 py-3 font-semibold">الموعد</th><th className="px-5 py-3 font-semibold">الطبيب</th><th className="px-5 py-3 font-semibold">معرّف المريض</th><th className="px-5 py-3 font-semibold">الخدمة</th><th className="px-5 py-3 font-semibold">القناة</th><th className="px-5 py-3 font-semibold">الحالة</th><th className="px-5 py-3" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="px-5 py-4">{formatDateTime(appointment.starts_at)}</td>
                      <td className="px-5 py-4">{doctors.find((doctor) => doctor.id === appointment.doctor_id)?.full_name || "-"}</td>
                      <td className="px-5 py-4">
                        {patients.find((patient) => patient.id === appointment.patient_id)?.full_name
                          || patients.find((patient) => patient.id === appointment.patient_id)?.phone
                          || appointment.patient_id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-4">{appointment.service || "-"}</td>
                      <td className="px-5 py-4">{appointment.source === "walk_in" ? "حضوري" : appointment.source}</td>
                      <td className="px-5 py-4">{statusName(appointment.status)}</td>
                      <td className="px-5 py-4">{["pending", "confirmed", "waiting"].includes(appointment.status) && (
                        <button type="button" onClick={() => void cancelAppointment(appointment.id)} disabled={updating === appointment.id} className="text-xs font-semibold text-rose-700 disabled:opacity-50">
                          {updating === appointment.id ? "جارٍ الإلغاء..." : "إلغاء"}
                        </button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
