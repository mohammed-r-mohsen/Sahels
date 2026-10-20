import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { appointmentRows } from "@/lib/mock-data";
import { CalendarDays, Plus } from "lucide-react";

const columns = [
  { key: "time", header: "الوقت" },
  { key: "patient", header: "المريض" },
  { key: "doctor", header: "الطبيب" },
  { key: "status", header: "الحالة" },
  { key: "channel", header: "القناة" },
];

export default function AppointmentsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">المواعيد</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">تقويم ومتابعة الحجوزات</h1>
          </div>
          <button className="btn-primary">
            <Plus className="ml-2 h-4 w-4" />
            حجز يدوي
          </button>
        </div>

        <div className="card p-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <CalendarDays className="h-5 w-5 text-sky-600" />
              تقويم الأسبوع الحالي
            </div>
            <div className="chip">12 أكتوبر - 18 أكتوبر</div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 text-xs font-bold text-slate-500">الأحد</div>
                <div className="space-y-2 text-xs">
                  <div className="rounded-lg bg-sky-100 px-2 py-1 text-sky-700">08:00</div>
                  <div className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-700">10:30</div>
                  <div className="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">13:00</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DataTable title="جدول المواعيد" rows={appointmentRows} columns={columns} />
      </div>
    </DashboardShell>
  );
}
