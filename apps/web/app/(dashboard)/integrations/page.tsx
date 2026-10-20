import { DashboardShell } from "@/components/dashboard-shell";
import { Link2, MessageSquareText, Phone, ShieldCheck } from "lucide-react";

const integrationRows = [
  { name: "واتساب Business", status: "مُفعل", icon: MessageSquareText },
  { name: "Instagram DM", status: "مُفعل", icon: Phone },
  { name: "API Webhooks", status: "قيد التكوين", icon: Link2 },
  { name: "الخصوصية والأمان", status: "مُؤكد", icon: ShieldCheck },
];

export default function IntegrationsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">التكاملات</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة القنوات والواجهات</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {integrationRows.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.name} className="card p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-xl font-black text-slate-900">{item.name}</div>
                <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{item.status}</div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
