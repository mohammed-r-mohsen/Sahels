import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { patientRows } from "@/lib/mock-data";
import { Download, Plus, Search } from "lucide-react";

const columns = [
  { key: "name", header: "الاسم" },
  { key: "phone", header: "الهاتف" },
  { key: "lastVisit", header: "آخر زيارة" },
  { key: "visits", header: "عدد الزيارات" },
  { key: "risk", header: "الحالة" },
];

export default function PatientsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">المرضى</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">قائمة المرضى</h1>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary">
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </button>
            <button className="btn-primary">
              <Plus className="ml-2 h-4 w-4" />
              إضافة مريض
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input placeholder="بحث عن مريض" className="w-full bg-transparent text-right outline-none sm:w-72" />
            </div>
            <div className="chip">842 مريض مسجل</div>
          </div>
        </div>

        <DataTable title="سجل المرضى" rows={patientRows} columns={columns} />
      </div>
    </DashboardShell>
  );
}
