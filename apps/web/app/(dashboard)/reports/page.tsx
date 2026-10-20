import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { reportRows } from "@/lib/mock-data";
import { Download } from "lucide-react";

const columns = [
  { key: "period", header: "الفترة" },
  { key: "bookings", header: "الحجوزات" },
  { key: "attendance", header: "الحضور" },
  { key: "noShow", header: "عدم الحضور" },
  { key: "revenue", header: "الإيراد" },
];

export default function ReportsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">التقارير</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">تقارير العيادة والتحليل</h1>
          </div>
          <button className="btn-secondary">
            <Download className="ml-2 h-4 w-4" />
            تصدير التقرير
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "إجمالي الحجوزات", value: "1,284" },
            { title: "معدل الحضور", value: "96.2%" },
            { title: "عدم الحضور", value: "3.8%" },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="text-sm text-slate-500">{item.title}</div>
              <div className="mt-3 text-3xl font-black text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>

        <DataTable title="ملخص الأداء الشهري" rows={reportRows} columns={columns} />
      </div>
    </DashboardShell>
  );
}
