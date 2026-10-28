import Link from "next/link";
import { ArrowLeft, Mail, ShieldAlert } from "lucide-react";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="سهل، الرئيسية">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-lg font-black text-white">S</span>
            <span className="text-lg font-bold">سهل</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
            <Link href="/about" className="hover:text-sky-700">عن سهل</Link>
            <Link href="/login" className="hover:text-sky-700">دخول العيادة</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <div className="mb-5 text-sm font-semibold text-sky-700">تواصل معنا</div>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-6xl">
            فريق سهل يسمع منك.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            للاستفسار عن المنصة أو طلب المساعدة، راسل فريق الدعم. وللإبلاغ عن مشكلة أمنية، استخدم قناة الإبلاغ المخصصة.
          </p>
        </div>

        <div className="divide-y divide-slate-200 border-y border-slate-200">
          <section className="py-6">
            <div className="flex items-center gap-3 text-slate-500"><Mail className="h-5 w-5 text-sky-700" /><h2 className="text-sm font-semibold">الدعم والاستفسارات</h2></div>
            <a href="mailto:support@sahels.net" className="mt-4 inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-sky-700">
              support@sahels.net <ArrowLeft className="h-4 w-4" />
            </a>
          </section>
          <section className="py-6">
            <div className="flex items-center gap-3 text-slate-500"><ShieldAlert className="h-5 w-5 text-sky-700" /><h2 className="text-sm font-semibold">بلاغ أمني</h2></div>
            <a href="mailto:security@sahels.net" className="mt-4 inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-sky-700">
              security@sahels.net <ArrowLeft className="h-4 w-4" />
            </a>
            <p className="mt-2 text-sm leading-6 text-slate-500">لا ترفق بيانات مرضى أو أسرار دخول في البلاغ.</p>
          </section>
          <section className="py-6">
            <Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white transition hover:bg-sky-800">
              إنشاء حساب عيادة <ArrowLeft className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-slate-500 sm:px-8">
          <span>© 2026 سهل</span>
          <div className="flex gap-5">
            <Link href="/about" className="hover:text-slate-900">عن سهل</Link>
            <Link href="/privacy" className="hover:text-slate-900">الخصوصية</Link>
            <Link href="/terms" className="hover:text-slate-900">الشروط</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}