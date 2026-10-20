import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";

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
          أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور خلال دقائق.
        </div>

        <form className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">البريد الإلكتروني</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
              <Mail className="h-4 w-4 text-slate-400" />
              <input type="email" defaultValue="admin@sahelclinic.sa" className="w-full bg-transparent px-2 py-3 text-right outline-none" />
            </div>
          </label>

          <button type="button" className="btn-primary w-full !rounded-2xl !py-3.5">إرسال رابط الاستعادة</button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          حماية بيانات المريض والخصوصية مضمونة
        </div>
      </div>
    </main>
  );
}
