import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";

const plans = [
  { name: "Starter", price: "SAR 299", tag: "لعيادة صغيرة", perks: ["1 عيادة", "2 أطباء", "تذكيرات SMS", "تقارير أساسية"], active: false },
  { name: "Growth", price: "SAR 469", tag: "الأكثر طلبًا", perks: ["حتى 8 أطباء", "قائمة انتظار", "واتساب Business", "AI assistant"], active: true },
  { name: "Scale", price: "SAR 659", tag: "للعيادات المتوسعة", perks: ["عدد أطباء مرن", "قنوات متعددة", "API/Webhooks", "تحليلات متقدمة"], active: false },
];

export default function PlanPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">اختيار الخطة</div>
          <h1 className="mt-3 text-4xl font-black text-slate-900">اختر الخطة الأنسب لنمو عيادتك</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-[2rem] border p-6 shadow-soft ${plan.active ? "border-sky-500 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
              <div className="mb-5 flex items-center justify-between">
                <div className="text-2xl font-black">{plan.name}</div>
                {plan.active && <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">الأكثر شعبية</span>}
              </div>

              <div className="mb-5 flex items-end gap-2">
                <span className="text-4xl font-black">{plan.price}</span>
                <span className={`text-sm ${plan.active ? "text-sky-100" : "text-slate-500"}`}>/شهر</span>
              </div>

              <div className={`mb-5 rounded-full px-3 py-2 text-center text-sm font-semibold ${plan.active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>{plan.tag}</div>

              <ul className={`space-y-3 text-sm ${plan.active ? "text-sky-50" : "text-slate-600"}`}>
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <CheckCircle2 className={`h-4 w-4 ${plan.active ? "text-white" : "text-emerald-600"}`} />
                    {perk}
                  </li>
                ))}
              </ul>

              <Link href="/dashboard" className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-bold ${plan.active ? "bg-white text-sky-700" : "bg-slate-900 text-white"}`}>
                ابدأ الآن
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          الدفع آمن، مع إمكانية الترقية في أي وقت.
        </div>
      </div>
    </main>
  );
}
