import { DashboardShell } from "@/components/dashboard-shell";
import { Save, ShieldCheck, Smartphone, Wrench } from "lucide-react";

const settingsSections = [
  { title: "معلومات العيادة", icon: Wrench, fields: ["اسم العيادة", "الموقع", "المدينة", "الهوية البصرية"] },
  { title: "ساعات العمل", icon: ShieldCheck, fields: ["من الاثنين إلى الجمعة", "الأيام الطويلة", "اختيارات التوقف"] },
  { title: "التذكير", icon: Smartphone, fields: ["واتساب", "SMS", "رسائل بريدية", "تذكير قبل الموعد"] },
];

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الإعدادات</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إعدادات العيادة</h1>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="card p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{section.title}</h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  {section.fields.map((field) => (
                    <li key={field} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {field}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">معلومات العيادة</h3>
            <button className="btn-primary"><Save className="ml-2 h-4 w-4" /> حفظ التغييرات</button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">اسم العيادة</span><input defaultValue="أسنان الراشد" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">المدينة</span><input defaultValue="الرياض" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" /></label>
            <label className="block md:col-span-2"><span className="mb-2 block text-sm font-semibold text-slate-700">الوصف</span><textarea rows={4} defaultValue="عيادة أسنان حديثة تقدم الخدمات العلاجية والتجميلية مع تجربة مريحة للمرضى." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" /></label>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
