import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">استعادة الوصول</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">نسيت كلمة المرور؟</h1>
          </div>
          <Link href="/login" className="text-sm font-semibold text-slate-500">تسجيل الدخول</Link>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">
          استعادة كلمة المرور غير مفعّلة حالياً. تواصل مع مسؤول النظام لاستعادة الوصول.
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          حماية بيانات المريض والخصوصية مضمونة
        </div>
      </div>
    </main>
  );
}
