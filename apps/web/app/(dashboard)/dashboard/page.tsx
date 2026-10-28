"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { CalendarDays, ClipboardList, Stethoscope, XCircle } from "lucide-react";

type BookingSummary = { bookings: number; cancelled: number; completed: number; no_show: number };
type BookingReports = { weekly: BookingSummary; monthly: BookingSummary };
type Doctor = { id: string; full_name: string };
type Appointment = {
  id: string;
  doctor_id: string;
  patient_id: string;
  starts_at: string;
  status: string;
  service: string | null;
};

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر تحميل بيانات العيادة.";
}

function SummaryCard({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof CalendarDays; tone: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-500">{label}</div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value.toLocaleString("ar-SA")}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [reports, setReports] = useState<BookingReports | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 7);
    const range = new URLSearchParams({ from: now.toISOString(), to: to.toISOString() });
    Promise.all([
      api<BookingReports>("/analytics/booking-reports"),
      api<Appointment[]>(`/appointments?${range.toString()}`),
      api<Doctor[]>("/clinic/doctors"),
    ])
      .then(([bookingReports, upcoming, doctorRows]) => {
        setReports(bookingReports);
        setAppointments(upcoming);
        setDoctors(doctorRows);
      })
      .catch((loadError: unknown) => setError(errorText(loadError)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold text-sky-700">لوحة التحكم</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">نظرة عامة على العيادة</h1>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <div className="card p-6 text-slate-500">جارٍ تحميل بيانات العيادة...</div> : reports && (
          <>
            <section>
              <div className="mb-3 text-sm font-bold text-slate-600">هذا الأسبوع</div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="الحجوزات" value={reports.weekly.bookings} icon={CalendarDays} tone="text-sky-700" />
                <SummaryCard label="الإلغاءات" value={reports.weekly.cancelled} icon={XCircle} tone="text-rose-700" />
                <SummaryCard label="الحضور المكتمل" value={reports.weekly.completed} icon={ClipboardList} tone="text-emerald-700" />
                <SummaryCard label="الأطباء" value={doctors.length} icon={Stethoscope} tone="text-slate-700" />
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h2 className="font-black text-slate-900">المواعيد القادمة</h2>
                  <p className="mt-1 text-sm text-slate-500">{reports.monthly.bookings.toLocaleString("ar-SA")} حجز في الشهر الحالي · {reports.monthly.cancelled.toLocaleString("ar-SA")} ملغي</p>
                </div>
                <Link href="/appointments" className="text-sm font-bold text-sky-700">عرض التقويم</Link>
              </div>
              {!appointments.length ? (
                <p className="p-5 text-sm text-slate-500">لا توجد مواعيد خلال الأيام السبعة المقبلة.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {appointments.slice(0, 6).map((appointment) => (
                    <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div>
                        <div className="font-semibold text-slate-900">{doctors.find((doctor) => doctor.id === appointment.doctor_id)?.full_name || "طبيب"}</div>
                        <div className="mt-1 text-xs text-slate-500">{appointment.service || "موعد"} · {appointment.patient_id.slice(0, 8)}</div>
                      </div>
                      <time className="text-sm text-slate-600">
                        {new Date(appointment.starts_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
