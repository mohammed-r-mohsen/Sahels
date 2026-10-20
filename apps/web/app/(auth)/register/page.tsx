"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Building2, CalendarCheck2, Mail, UserRound } from "lucide-react";
import { registerClinic } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const fullName = [
      String(formData.get("first_name") || "").trim(),
      String(formData.get("last_name") || "").trim()
    ].filter(Boolean).join(" ");

    try {
      await registerClinic({
        full_name: fullName,
        clinic_name: String(formData.get("clinic_name")),
        slug: String(formData.get("slug")).trim(),
        email: String(formData.get("email")),
        phone: String(formData.get("phone") || "").trim() || undefined,
        password: String(formData.get("password"))
      });
      router.push("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر إنشاء الحساب.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-sky-700 p-8 text-white">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-black">S</div>
              <div>
                <div className="text-xl font-black">Sahl</div>
                <div className="text-[10px] tracking-[0.22em] text-sky-100">NEW CLINIC</div>
              </div>
            </div>
            <h1 className="text-4xl font-black leading-tight">ابدأ بجديد ميزة إدارة العيادة السعودية الحديثة.</h1>
            <div className="mt-8 space-y-4 text-sky-100">
              <div className="flex items-center gap-3"><Building2 className="h-5 w-5" /> إدارة عيادة مستقلة</div>
              <div className="flex items-center gap-3"><CalendarCheck2 className="h-5 w-5" /> إشعارات وتذكيرات تلقائية</div>
              <div className="flex items-center gap-3"><UserRound className="h-5 w-5" /> تجربة مريحة للموظف والطبيب</div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold tracking-[0.2em] text-sky-700">إنشاء حساب</div>
                <h2 className="mt-2 text-3xl font-black text-slate-900">ابدأ بثقة</h2>
              </div>
              <Link href="/" className="text-sm font-semibold text-slate-500">الرئيسية</Link>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">الاسم الأول</span>
                  <input name="first_name" type="text" autoComplete="given-name" required maxLength={60} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">اسم العائلة</span>
                  <input name="last_name" type="text" autoComplete="family-name" required maxLength={60} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">اسم العيادة</span>
                <input name="clinic_name" type="text" autoComplete="organization" required maxLength={160} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">معرّف العيادة</span>
                <input name="slug" type="text" required minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" dir="ltr" placeholder="sahel-clinic-riyadh" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left outline-none" />
                <span className="mt-1 block text-xs text-slate-500">أحرف إنجليزية صغيرة وأرقام وشرطة، ويجب أن يكون فريداً.</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">البريد الإلكتروني</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input name="email" type="email" autoComplete="email" required maxLength={254} className="w-full bg-transparent px-2 py-3 text-right outline-none" />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">رقم الهاتف</span>
                <input name="phone" type="tel" autoComplete="tel" maxLength={32} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">كلمة المرور</span>
                <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-right outline-none" />
              </label>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <input name="terms" type="checkbox" required className="h-4 w-4 rounded border-slate-300 accent-sky-600" />
                أوافق على <Link href="/terms" className="font-semibold text-sky-700">الشروط</Link> و <Link href="/privacy" className="font-semibold text-sky-700">الخصوصية</Link>
              </div>

              {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
              <button type="submit" disabled={pending} className="btn-primary w-full !rounded-2xl !py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                {pending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
