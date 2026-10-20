import Link from "next/link";
import { ArrowLeft, ChevronLeft, ShieldCheck, Sparkles, Stethoscope, TabletSmartphone, Users } from "lucide-react";

const features = [
  { icon: Stethoscope, title: "إدارة المواعيد الذكية", text: "تقويم مُحسن، قوائم انتظار، وتنبيهات تلقائية لكل طبيب وعيادة." },
  { icon: Users, title: "خبرة المريض", text: "تجربة احترافية من الحجز إلى المتابعة والسداد والتذكير." },
  { icon: Sparkles, title: "ذكاء اصطناعي", text: "رد سريع على واتساب/إنستغرام مع فحص الحجز وتوجيه الرسائل إلى الموظف عند الحاجة." },
  { icon: ShieldCheck, title: "التوافق والخصوصية", text: "حلول تدعم خصوصية المريض، الشروط، وسلامة البيانات وفق معايير السوق السعودي." },
];

const stats = [
  { label: "حجوزات مُنجزة", value: "12.8k" },
  { label: "نسبة الحضور", value: "96%" },
  { label: "تقليل عدم الحضور", value: "-41%" },
  { label: "رسائل تلقائية", value: "3.4k" },
];

const plans = [
  { name: "ابدأ", price: "299", highlight: false, perks: ["عيادة واحدة", "إدارة أساسية", "تذكير SMS", "تقارير شهرية"] },
  { name: "نمو", price: "799", highlight: true, perks: ["حتى 5 أطباء", "قائمة انتظار", "تكامل واتساب", "تقارير متقدمة"] },
  { name: "مستوى المؤسسة", price: "1499", highlight: false, perks: ["عدة عيادات", "دعم مخصص", "AI assistant", "API & Webhooks"] },
];

const faqs = [
  { q: "هل النظام مناسب للعيادات الصغيرة والمتوسطة؟", a: "نعم، تم تصميمه خصيصًا للعيادات من طبيب واحد إلى 10 أطباء، مع دعم متعدد المستأجرين." },
  { q: "هل يدعم العربية والإنجليزية؟", a: "نعم، يحتوي على واجهة عربية بالكامل مع دعم RTL، مع إمكانية تبديل اللغة إلى الإنجليزية داخل الواجهة." },
  { q: "هل يمكن ربطه بواتساب وإنستغرام؟", a: "نعم، تم تجهيز السطح الوظيفي للتكامل مع واتساب Business وInstagram DM عبر واجهة إعدادات جاهزة." },
  { q: "هل توجد قائمة انتظار؟", a: "بالطبع، يوجد نظام قائمة انتظار مع أولويات وتوجيه للحجوزات القادمة." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-lg font-black text-white shadow-soft">S</div>
            <div>
              <div className="text-lg font-black text-slate-900">Sahl</div>
              <div className="text-[10px] font-medium tracking-[0.18em] text-slate-500">SAUDI CLINIC SaaS</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <Link href="#features">المزايا</Link>
            <Link href="#workflow">كيف يعمل</Link>
            <Link href="#solutions">الحلول</Link>
            <Link href="#pricing">الأسعار</Link>
            <Link href="#faq">الأسئلة</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 md:inline-flex">تسجيل الدخول</Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-sky-700">
              ابدأ الآن
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),transparent_35%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
              <Sparkles className="h-4 w-4" />
              منصة عربية متكاملة للعيادات الطبية
            </div>

            <div className="space-y-5">
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                إدارة مواعيد وعمليات لعيادات الأسنان بذكاء سعودي حقيقي.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-slate-600">
                سهل يربط الحجز، التذكير، قائمة الانتظار، المدفوعات، التقارير، والرد على الرسائل في منصة واحدة مصممة للعناية الطبية واحتياجات عيادات الأسنان في السعودية.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-6 py-3.5 text-base font-bold text-white shadow-soft transition hover:bg-sky-700">
                إنشاء حساب مجاني
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-slate-800 transition hover:border-slate-300">
                شاهد العرض
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                  <div className="text-2xl font-black text-slate-900">{item.value}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-soft">
              <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-300">العيادة الذكية</div>
                    <div className="mt-2 text-2xl font-black">مستشفى أسنان المدينة</div>
                  </div>
                  <div className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">نشط</div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-slate-300">الحجوزات اليوم</div>
                    <div className="mt-2 text-3xl font-black text-white">48</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-slate-300">نسبة الحضور</div>
                    <div className="mt-2 text-3xl font-black text-emerald-300">96%</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-slate-300">قائمة الانتظار</div>
                    <div className="mt-2 text-3xl font-black text-amber-300">12</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-slate-300">التذكيرات</div>
                    <div className="mt-2 text-3xl font-black text-sky-300">84</div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-slate-900 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>الإيرادات الشهرية</span>
                    <span>+18.4%</span>
                  </div>
                  <div className="mt-3 text-3xl font-black text-white">SAR 42,750</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <div className="mb-4 text-sm font-bold tracking-[0.24em] text-sky-700">المزايا</div>
          <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">نظام يخفف الضغط عن الإدارة ويعطي المريض تجربة مريحة.</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-1">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-3 text-xl font-black text-slate-900">{feature.title}</h3>
                <p className="text-sm leading-7 text-slate-600">{feature.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="workflow" className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <div className="mb-4 text-sm font-bold tracking-[0.24em] text-sky-300">كيف يعمل</div>
            <h2 className="text-3xl font-black sm:text-4xl">من الحجز إلى المتابعة، كل شيء تحت قبضة الإدارة.</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "استقبال الطلب", text: "يصل حجز جديد من واتساب أو إنستغرام أو الزيارة المباشرة داخل العيادة." },
              { step: "02", title: "تأكيد وتنسيق", text: "يتم فحص الوقت، اختيار الطبيب، وتفعيل رسالة التذكير تلقائيًا." },
              { step: "03", title: "متابعة بعد الموعد", text: "تحديث كامل عن الحضور، التأخير، الالغاء، وملف المريض في سجل واحد." },
            ].map((item) => (
              <div key={item.step} className="rounded-3xl border border-slate-800 bg-white/5 p-6">
                <div className="mb-4 text-sm font-black text-sky-300">{item.step}</div>
                <h3 className="mb-3 text-2xl font-black">{item.title}</h3>
                <p className="text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <div className="mb-4 text-sm font-bold tracking-[0.24em] text-emerald-700">حلول للعيادات</div>
          <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">مصمم لعيادات الأسنان الصغيرة والمتوسطة والعناية الرقمية.</h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {[
            { title: "عيادة أسنان خاصة", text: "تنظيم المواعيد، التحضير، والرد السريع مع الموظف والمرضى." },
            { title: "عيادات متعددة", text: "دعم متعدد العيادات، كل عيادة مستقلة ببياناتها وأذونات موظفيها." },
            { title: "توسعة مستقبليًا", text: "منصة جاهزة للربط مع أنظمة الدفع والذكاء الاصطناعي والتكاملات التشغيلية." },
          ].map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-sky-50 p-6 shadow-soft">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <TabletSmartphone className="h-5 w-5" />
              </div>
              <h3 className="mb-3 text-2xl font-black text-slate-900">{item.title}</h3>
              <p className="text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-slate-100 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <div className="mb-4 text-sm font-bold tracking-[0.24em] text-sky-700">الأسعار</div>
            <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">خطط تناسب نمو العيادة من البداية إلى التوسع.</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className={`rounded-3xl border p-6 shadow-soft ${plan.highlight ? "border-sky-500 bg-sky-600 text-white shadow-[0_20px_45px_rgba(37,99,235,0.35)]" : "border-slate-200 bg-white text-slate-900"}`}>
                <div className="mb-5 flex items-center justify-between">
                  <div className="text-xl font-black">{plan.name}</div>
                  {plan.highlight && <div className="rounded-full bg-white/20 px-2 py-1 text-xs font-bold">الأكثر شعبية</div>}
                </div>
                <div className="mb-6 flex items-end gap-2">
                  <span className="text-4xl font-black">SAR {plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-sky-100" : "text-slate-500"}`}>/شهر</span>
                </div>
                <ul className={`space-y-3 text-sm ${plan.highlight ? "text-sky-50" : "text-slate-600"}`}>
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${plan.highlight ? "bg-white" : "bg-emerald-500"}`} />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-bold ${plan.highlight ? "bg-white text-sky-700" : "bg-slate-900 text-white"}`}>
                  اختر الخطة
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <div className="mb-4 text-sm font-bold tracking-[0.24em] text-slate-500">FAQ</div>
          <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">الأسئلة الأكثر شيوعًا</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-black text-slate-900">{faq.q}</h3>
              <p className="mt-3 text-slate-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sky-700 py-16 text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 px-4 text-center sm:px-6 lg:px-8 lg:flex-row lg:text-right">
          <div>
            <div className="text-sm font-bold tracking-[0.22em] text-sky-100">ابدأ اليوم</div>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">أعد هيكلة استقبال عيادتك وتوفير الوقت للمرضى.</h2>
          </div>
          <Link href="/register" className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-base font-black text-sky-700 shadow-soft">
            إنشاء عيادة جديدة
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-slate-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>© 2026 Sahl. جميع الحقوق محفوظة.</div>
          <div className="flex items-center gap-5">
            <Link href="/privacy">الخصوصية</Link>
            <Link href="/terms">الشروط</Link>
            <Link href="/login">الدخول</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
