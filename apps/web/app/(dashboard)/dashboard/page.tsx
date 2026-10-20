import { DashboardShell } from "@/components/dashboard-shell";
import { StatsCard } from "@/components/stats-card";
import { DataTable } from "@/components/data-table";
import { CalendarCard } from "@/components/calendar-card";
import { appointmentRows, clinicMetrics, recentPatients, waitlistRows } from "@/lib/mock-data";
import { DollarSign, ShieldCheck, TrendingUp, Users } from "lucide-react";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">لوحة التحكم</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">نظرة عامة على العيادة</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            جميع الأنظمة مستقرة هذا الأسبوع
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="عدد الحجوزات" value="1,284" change="+12.4%" icon={() => <span className="text-xl">📅</span>} tone="sky" />
          <StatsCard title="نسبة الحضور" value="96.2%" change="+3.1%" icon={() => <span className="text-xl">📈</span>} tone="emerald" />
          <StatsCard title="الإيرادات" value="SAR 42,750" change="+18.4%" icon={() => <span className="text-xl">💰</span>} tone="amber" />
          <StatsCard title="عدد المرضى" value="842" change="+8.7%" icon={() => <span className="text-xl">👥</span>} tone="violet" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <CalendarCard />
          <div className="space-y-6">
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">التذكيرات المنجزة</h3>
                <span className="chip">هذا الأسبوع</span>
              </div>
              <div className="space-y-4">
                {clinicMetrics.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-bold text-slate-900">{item.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">حالات قائمة الانتظار</h3>
                <span className="text-sm font-bold text-amber-600">12 حالة</span>
              </div>
              <div className="space-y-3">
                {waitlistRows.slice(0, 3).map((item) => (
                  <div key={item.patient} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                    <div>
                      <div className="font-bold text-slate-900">{item.patient}</div>
                      <div className="text-xs text-slate-500">{item.doctor}</div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">أولوية {item.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DataTable title="المواعيد الأخيرة" rows={appointmentRows.slice(0, 5)} columns={[
            { key: "time", header: "الوقت" },
            { key: "patient", header: "المريض" },
            { key: "doctor", header: "الطبيب" },
            { key: "status", header: "الحالة" },
          ]} />

          <DataTable title="المرضى الجدد" rows={recentPatients} columns={[
            { key: "name", header: "الاسم" },
            { key: "lastVisit", header: "آخر زيارة" },
            { key: "notes", header: "ملاحظات" },
          ]} />
        </div>
      </div>
    </DashboardShell>
  );
}
