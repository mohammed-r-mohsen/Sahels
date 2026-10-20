import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { waitlistRows } from "@/lib/mock-data";

const columns = [
  { key: "patient", header: "المريض" },
  { key: "doctor", header: "الطبيب" },
  { key: "priority", header: "الأولوية" },
  { key: "waitTime", header: "زمن الانتظار" },
  { key: "status", header: "الحالة" },
];

export default function WaitingListPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">قائمة الانتظار</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">ترتيب الانتظار وتحديث الحالات</h1>
          </div>
          <button className="btn-primary">
            إضافة إلى قائمة الانتظار
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "الانتظار اليوم", value: "12" },
            { title: "في انتظار التقييم", value: "4" },
            { title: "مجدولون في اليوم", value: "9" },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="text-sm text-slate-500">{item.title}</div>
              <div className="mt-3 text-3xl font-black text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>

        <DataTable title="قائمة الانتظار الحالية" rows={waitlistRows} columns={columns} />
      </div>
    </DashboardShell>
  );
}
