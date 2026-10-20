import { DashboardShell } from "@/components/dashboard-shell";
import { Bot, MessageSquareText, Sparkles } from "lucide-react";

export default function AiAssistantPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">AI Assistant</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إعدادات الرد الآلي</h1>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { title: "أسئلة متكررة", value: "36", icon: MessageSquareText },
            { title: "الردود المسموح بها", value: "18", icon: Bot },
            { title: "النشاط اليومي", value: "94%", icon: Sparkles },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="text-sm text-slate-500">{item.title}</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h3 className="text-xl font-black text-slate-900">إعدادات الرد التلقائي</h3>
          <div className="mt-5 space-y-4">
            {[
              "رد تلقائي عند تأكيد الحجز أو إعادة جدولة الموعد.",
              "استخدام اللغة العربية والإنجليزية حسب العميل.",
              "نقل الرسالة إلى موظف بشري عند الجدل الطبي أو حجز الحالات المعقدة.",
              "منع الإفصاح عن معلومات صحية حساسة دون تدخل بشري.",
            ].map((rule) => (
              <div key={rule} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-slate-700">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
