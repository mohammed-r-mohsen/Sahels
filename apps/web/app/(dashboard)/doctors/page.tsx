import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { doctorRows } from "@/lib/mock-data";
import { Plus, Search } from "lucide-react";

const columns = [
  { key: "name", header: "الاسم" },
  { key: "specialty", header: "التخصص" },
  { key: "clinic", header: "العيادة" },
  { key: "status", header: "الحالة" },
  { key: "slots", header: "ساعات العمل" },
];

export default function DoctorsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الأطباء</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة الفريق الطبي</h1>
          </div>
          <button className="btn-primary">
            <Plus className="ml-2 h-4 w-4" />
            إضافة طبيب
          </button>
        </div>

        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input placeholder="بحث باسم الطبيب أو التخصص" className="w-full bg-transparent text-right outline-none sm:w-72" />
            </div>
            <div className="chip">9 أطباء نشطين</div>
          </div>
        </div>

        <DataTable title="قائمة الأطباء" rows={doctorRows} columns={columns} />
      </div>
    </DashboardShell>
  );
}
