import Link from "next/link";
import { ArrowLeft, CalendarDays, MessageSquareText, ShieldCheck, Stethoscope } from "lucide-react";

const principles = [
  {
    number: "01",
    icon: CalendarDays,
    title: "الموعد واضح للجميع",
    text: "إدارة جداول الأطباء، الإتاحة، الحجوزات الحضورية، والإلغاء من لوحة واحدة.",
  },
  {
    number: "02",
    icon: MessageSquareText,
    title: "المحادثة لا تضيع",
    text: "مساعد WhatsApp يستعلم ويحجز ضمن صلاحيات العيادة. رسائل Instagram المحوّلة تصل لصندوق متابعة الفريق.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "لكل عيادة مساحتها",
    text: "صلاحيات منفصلة للفريق وبيانات تشغيلية مرتبطة بالعيادة، مع سجلات تدقيق للعمليات المهمة.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="سهل، الرئيسية">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-lg font-black text-white">S</span>
            <span className="text-lg font-bold">سهل</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
            <Link href="/contact" className="hover:text-sky-700">تواصل معنا</Link>
            <Link href="/login" className="hover:text-sky-700">دخول العيادة</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:px-8 sm:pt-24">
        <div className="max-w-3xl">
          <div className="mb-5 text-sm font-semibold text-sky-700">عن سهل</div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-6xl">
            وقت أقل في التنسيق.
            <span className="block text-slate-500">وتركيز أكبر على المريض.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            سهل منصة لإدارة عمليات العيادة اليومية: الأطباء وجداولهم، المواعيد والحجوزات، تقارير الحضور والإلغاء، ومتابعة الرسائل التي تحتاج تدخلاً من الفريق.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white transition hover:bg-sky-800">
              ابدأ مع سهل <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex min-h-12 items-center rounded-full border border-slate-300 bg-white px-5 font-semibold text-slate-800 transition hover:border-slate-400">
              تواصل مع الفريق
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-10">
          <div className="flex items-center gap-3 text-sky-300">
            <Stethoscope className="h-5 w-5" />
            <span className="text-sm font-semibold">منظومة تشغيل العيادة</span>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: "الأطباء", value: "الجداول والسعة" },
              { label: "المواعيد", value: "الحجز والتغيير" },
              { label: "الفريق", value: "متابعة الرسائل" },
            ].map((item) => (
              <div key={item.label} className="border-t border-white/15 pt-4">
                <div className="text-sm text-slate-400">{item.label}</div>
                <div className="mt-2 text-xl font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs leading-6 text-slate-400">معاينة توضيحية؛ لا تمثل بيانات عيادة حقيقية.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">ما يهم في التشغيل اليومي</h2>
          <p className="mt-3 leading-7 text-slate-600">أدوات عملية للمالك والفريق، مع وضوح في كل خطوة.</p>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {principles.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.number} className="grid gap-4 py-6 sm:grid-cols-[4rem_1fr_1.2fr] sm:items-start sm:gap-8">
                <span className="text-sm font-semibold text-slate-400">{item.number}</span>
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-sky-700" />
                  <h3 className="font-semibold text-slate-950">{item.title}</h3>
                </div>
                <p className="text-sm leading-7 text-slate-600">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-slate-500 sm:px-8">
          <span>© 2026 سهل</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-slate-900">الخصوصية</Link>
            <Link href="/terms" className="hover:text-slate-900">الشروط</Link>
            <Link href="/contact" className="hover:text-slate-900">التواصل</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}