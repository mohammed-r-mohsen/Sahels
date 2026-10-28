import Link from "next/link";
import { CheckCircle2, Dental, ShieldCheck } from "lucide-react";

const clinicSteps = [
  "إضافة معلومات العيادة: الاسم، الموقع، الهاتف، شعار، وساعات العمل.",
  "تحديد الأطباء والتخصصات ومواعيد العمل لكل طبيب.",
  "تفعيل التذكيرات وواتساب/إنستغرام وقنوات الدفع.",
  "تجهيز الحساب والبدء بجميع الأدوات التشغيلية.",
];

const plans = [
  { name: "Starter", price: "SAR 299", text: "لعيادة صغيرة" },
  { name: "Growth", price: "SAR 469", text: "للعيادات المتوسّطة" },
  { name: "Scale", price: "SAR 659", text: "للعيادات المتوسعة" },
];

export default function NewClinicPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 py-12">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">إعداد العيادة</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">أنشئ عيادتك في 4 خطوات</h1>
          </div>
          <Link href="/" className="text-sm font-semibold text-slate-500">الرئيسية</Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            {clinicSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white">{index + 1}</div>
                <div className="text-base text-slate-700">{step}</div>
              </div>
            ))}
          </div>

          <div className="space-y-5 rounded-3xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600">
                <Dental className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-black">معلومات العيادة</div>
                <div className="text-xs text-slate-400">التجهيز التلقائي</div>
              </div>
            </div>

            <form className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">اسم العيادة</span>
                <input type="text" defaultValue="أسنان الراشد" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-right text-white outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">المدينة</span>
                <input type="text" defaultValue="الرياض" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-right text-white outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">نوع العيادة</span>
                <input type="text" defaultValue="تجميل وجراحة" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-right text-white outline-none" />
              </label>
            </form>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <div className="text-lg font-black text-slate-900">{plan.name}</div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-3 text-3xl font-black text-slate-900">{plan.price}</div>
              <div className="mt-2 text-sm text-slate-600">{plan.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link href="/plan" className="btn-primary !rounded-2xl !px-6 !py-3.5">تابع إلى اختيار الخطة</Link>
        </div>
      </div>
    </main>
  );
}
