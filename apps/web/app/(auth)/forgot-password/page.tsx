import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <Link href="/login" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700">
          <ArrowRight className="h-4 w-4" /> العودة لتسجيل الدخول
        </Link>
        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <Mail className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">استعادة الوصول</h1>
        <p className="mt-3 leading-7 text-slate-600">
          لا تتوفر إعادة تعيين آلية لكلمة المرور بعد. تواصل مع الدعم من بريد العيادة المسجل للتحقق من ملكية الحساب.
        </p>
        <a href="mailto:support@sahels.net?subject=Password%20recovery" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800">
          مراسلة الدعم <Mail className="h-4 w-4" />
        </a>
      </div>
    </main>
  );
}
