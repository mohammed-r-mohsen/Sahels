import { DashboardShell } from "@/components/dashboard-shell";
import { CreditCard, ShieldCheck } from "lucide-react";

export default function BillingPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الفواتير والاشتراكات</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة الدفع والاشتراك</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: "حالة الاشتراك", value: "نشط" },
            { title: "الدفع القادم", value: "2026-11-01" },
            { title: "إجمالي الإيراد", value: "SAR 42,750" },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="text-sm text-slate-500">{item.title}</div>
              <div className="mt-3 text-3xl font-black text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">تفاصيل السداد</h3>
            <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              آمن ومؤمّن
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2 text-slate-600"><CreditCard className="h-5 w-5 text-sky-600" /> بطاقة الدفع</div>
              <div className="text-2xl font-black text-slate-900">•••• 0145</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 text-slate-600">خطة الاشتراك</div>
              <div className="text-2xl font-black text-slate-900">Growth</div>
              <div className="mt-2 text-sm text-slate-500">SAR 799 / شهر</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
