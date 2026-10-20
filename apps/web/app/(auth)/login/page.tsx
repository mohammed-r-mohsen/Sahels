"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Lock, Mail } from "lucide-react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      await login(
        String(formData.get("email")),
        String(formData.get("password"))
      );
      router.push("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر تسجيل الدخول.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft lg:grid-cols-2">
        <div className="hidden bg-slate-950 p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-lg font-black">S</div>
              <div>
                <div className="text-xl font-black">Sahl</div>
                <div className="text-[10px] tracking-[0.2em] text-slate-400">SAUDI CLINIC SaaS</div>
              </div>
            </div>
            <h1 className="text-4xl font-black leading-tight">مرحبًا مجددًا في نظام عيادة ذكية.</h1>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-white/5 p-5">
            <div className="mb-3 text-slate-300">إحصائيات اليوم</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-2xl font-black">48</div>
                <div className="text-xs text-slate-400">حجوزات</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-2xl font-black text-emerald-300">96%</div>
                <div className="text-xs text-slate-400">حضور</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold tracking-[0.2em] text-sky-700">تسجيل الدخول</div>
              <h2 className="mt-2 text-3xl font-black text-slate-900">الوصول إلى لوحة الإدارة</h2>
            </div>
            <Link href="/" className="text-sm font-semibold text-slate-500">الرئيسية</Link>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">البريد الإلكتروني</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                <Mail className="h-4 w-4 text-slate-400" />
                <input name="email" type="email" autoComplete="email" required maxLength={254} className="w-full bg-transparent px-2 py-3 text-right outline-none" />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">كلمة المرور</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                <Lock className="h-4 w-4 text-slate-400" />
                <input name="password" type="password" autoComplete="current-password" required className="w-full bg-transparent px-2 py-3 text-right outline-none" />
              </div>
            </label>

            <div className="flex justify-end text-sm">
              <span className="text-slate-400">استعادة كلمة المرور قريبًا</span>
            </div>

            {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
            <button type="submit" disabled={pending} className="btn-primary w-full !rounded-2xl !py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
            </button>

          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            ليس لديك حساب؟ <Link href="/register" className="font-bold text-sky-700">إنشاء حساب جديد</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
