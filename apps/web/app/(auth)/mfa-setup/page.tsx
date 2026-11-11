"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, CurrentSession } from "@/lib/api";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";

type SetupInfo = { secret: string; otpauth_uri: string };
type EnableResult = { enabled: boolean; recovery_codes: string[] };

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر إكمال إعداد MFA.";
}

export default function MfaSetupPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<CurrentSession>("/auth/me")
      .then((session) => {
        if (!session.mfa_enabled && ["clinic_admin", "super_admin"].includes(session.role)) return;
        router.replace("/dashboard");
      })
      .catch((loadError: unknown) => setError(errorText(loadError)))
      .finally(() => setLoading(false));
  }, [router]);

  async function beginSetup() {
    setSaving(true);
    setError("");
    try {
      setSetup(await api<SetupInfo>("/auth/mfa/setup", { method: "POST" }));
    } catch (setupError: unknown) {
      setError(errorText(setupError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api<EnableResult>("/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setRecoveryCodes(result.recovery_codes);
      setNotice("تم تفعيل المصادقة الثنائية. احفظ رموز الاسترداد الآن؛ لن تظهر مرة أخرى.");
    } catch (enableError: unknown) {
      setError(errorText(enableError));
    } finally {
      setSaving(false);
    }
  }

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setNotice("تم نسخ المفتاح.");
    } catch {
      setError("تعذر النسخ تلقائياً؛ حدّد المفتاح وانسخه يدوياً.");
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setNotice("تم نسخ رموز الاسترداد.");
    } catch {
      setError("تعذر النسخ تلقائياً؛ احفظ الرموز يدوياً.");
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-600">جارٍ التحقق من الحساب...</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="flex items-center gap-3 text-sky-700">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50"><ShieldCheck className="h-5 w-5" /></span>
          <span className="text-sm font-semibold">حماية حساب الإدارة</span>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">فعّل المصادقة الثنائية</h1>
        <p className="mt-3 leading-7 text-slate-600">استخدم تطبيق مصادقة يدعم TOTP. سيُطلب الرمز عند كل تسجيل دخول لحساب المدير.</p>

        {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        {!setup && !recoveryCodes.length && (
          <button type="button" onClick={() => void beginSetup()} disabled={saving} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
            <KeyRound className="h-4 w-4" /> {saving ? "جارٍ تجهيز المفتاح..." : "بدء الإعداد"}
          </button>
        )}

        {setup && !recoveryCodes.length && (
          <form onSubmit={confirmSetup} className="mt-7 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="font-semibold">أضف مفتاح Sahel يدوياً في تطبيق المصادقة</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">نوع الرمز: TOTP · 6 أرقام · يتغير كل 30 ثانية</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                <code dir="ltr" className="break-all font-mono text-sm font-bold tracking-wider">{setup.secret}</code>
                <button type="button" onClick={() => void copySecret()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50"><Copy className="h-4 w-4" />نسخ</button>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-sky-700">عرض رابط إعداد التطبيق</summary>
                <code dir="ltr" className="mt-3 block break-all rounded-lg bg-white p-3 text-xs text-slate-600">{setup.otpauth_uri}</code>
              </details>
            </div>
            <label className="block text-sm font-semibold">أدخل الرمز الظاهر في التطبيق
              <input required name="totp_code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono tracking-[0.35em] outline-none focus:border-sky-700" />
            </label>
            <button type="submit" disabled={saving || code.length !== 6} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
              {saving ? "جارٍ التحقق..." : "تأكيد وتفعيل MFA"}
            </button>
          </form>
        )}

        {recoveryCodes.length > 0 && (
          <section className="mt-7 space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
              خزّن هذه الرموز في مكان آمن خارج هذا الجهاز. كل رمز صالح لاستخدام واحد، ولا يمكن عرضها مجدداً.
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-950 p-4 text-center font-mono text-sm text-white sm:grid-cols-5">
              {recoveryCodes.map((recoveryCode) => <code key={recoveryCode} className="rounded-lg bg-white/10 px-2 py-3">{recoveryCode}</code>)}
            </div>
            <button type="button" onClick={() => void copyRecoveryCodes()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"><Copy className="h-4 w-4" />نسخ الرموز</button>
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)} className="h-4 w-4 accent-sky-700" />
              حفظت رموز الاسترداد في مكان آمن
            </label>
            <button type="button" disabled={!savedCodes} onClick={() => router.replace("/dashboard")} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
              <Check className="h-4 w-4" />متابعة إلى النظام
            </button>
          </section>
        )}
      </section>
    </main>
  );
}