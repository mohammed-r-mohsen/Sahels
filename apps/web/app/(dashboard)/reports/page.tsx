"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { Download, RefreshCw } from "lucide-react";

type BookingSummary = { bookings: number; cancelled: number; completed: number; no_show: number };
type BookingReports = { weekly: BookingSummary; monthly: BookingSummary };

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر تحميل التقرير.";
}

function exportCsv(reports: BookingReports) {
  const rows = [
    ["الفترة", "الحجوزات", "الملغاة", "المكتملة", "عدم الحضور"],
    ["الأسبوع الحالي", reports.weekly.bookings, reports.weekly.cancelled, reports.weekly.completed, reports.weekly.no_show],
    ["الشهر الحالي", reports.monthly.bookings, reports.monthly.cancelled, reports.monthly.completed, reports.monthly.no_show],
  ];
  const csv = `\uFEFF${rows.map((row) => row.join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "sahel-booking-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function PeriodReport({ title, summary }: { title: string; summary: BookingSummary }) {
  const cancellationRate = summary.bookings ? Math.round((summary.cancelled / summary.bookings) * 100) : 0;
  const metrics = [
    { label: "إجمالي الحجوزات", value: summary.bookings, tone: "text-slate-900" },
    { label: "الحجوزات الملغاة", value: summary.cancelled, tone: "text-rose-700" },
    { label: "المكتملة", value: summary.completed, tone: "text-emerald-700" },
    { label: "عدم الحضور", value: summary.no_show, tone: "text-amber-700" },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 p-5">
        <h2 className="font-black text-slate-900">{title}</h2>
        <span className="text-sm text-slate-500">معدل الإلغاء {cancellationRate}%</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
        {metrics.map((metric) => (
          <div key={metric.label} className="p-5">
            <div className="text-sm text-slate-500">{metric.label}</div>
            <div className={`mt-2 text-3xl font-black ${metric.tone}`}>{metric.value.toLocaleString("ar-SA")}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="mb-2 flex justify-between text-xs text-slate-500"><span>ملغاة</span><span>{cancellationRate}% من الحجوزات</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`معدل الإلغاء ${cancellationRate}%`}>
          <div className="h-full rounded-full bg-rose-500" style={{ width: `${cancellationRate}%` }} />
        </div>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<BookingReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await api<BookingReports>("/analytics/booking-reports"));
      setError("");
    } catch (loadError: unknown) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-bold text-sky-700">التقارير</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">الحجوزات والإلغاءات</h1>
            <p className="mt-2 text-sm text-slate-500">الفترات محسوبة حسب المنطقة الزمنية للعيادة.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadReports()} className="btn-secondary" aria-label="تحديث التقرير"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" onClick={() => reports && exportCsv(reports)} disabled={!reports} className="btn-secondary disabled:opacity-50"><Download className="ml-2 h-4 w-4" />تصدير CSV</button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading ? <div className="card p-6 text-slate-500">جارٍ تحميل التقرير...</div> : reports ? (
          <div className="space-y-5">
            <PeriodReport title="الأسبوع الحالي" summary={reports.weekly} />
            <PeriodReport title="الشهر الحالي" summary={reports.monthly} />
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
