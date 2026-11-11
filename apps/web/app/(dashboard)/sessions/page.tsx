"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError, logout } from "@/lib/api";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";

type Session = { id: string; created_at: string; expires_at: string; user_agent: string };

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر تنفيذ الطلب.";
}

function deviceName(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "Apple device";
  if (/android/i.test(userAgent)) return "Android device";
  if (/windows/i.test(userAgent)) return "Windows device";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac device";
  return userAgent || "جهاز غير معروف";
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api<Session[]>("/auth/sessions"));
      setError("");
    } catch (loadError: unknown) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function revokeSession(id: string) {
    setRevoking(id);
    setError("");
    try {
      await api(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadSessions();
      setNotice("تم إبطال الجلسة.");
    } catch (revokeError: unknown) {
      setError(errorText(revokeError));
    } finally {
      setRevoking("");
    }
  }

  async function revokeAllSessions() {
    setSaving(true);
    setError("");
    try {
      await api("/auth/sessions/revoke-all", { method: "POST" });
      await logout();
      router.replace("/login");
    } catch (revokeError: unknown) {
      setError(errorText(revokeError));
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: String(form.get("current_password")),
          new_password: String(form.get("new_password")),
        }),
      });
      await logout();
      router.replace("/login");
    } catch (changeError: unknown) {
      setError(errorText(changeError));
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold text-sky-700">الحساب والأمان</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">الجلسات وكلمة المرور</h1>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <MonitorSmartphone className="h-5 w-5 text-sky-700" />
              <div>
                <h2 className="font-semibold text-slate-950">الجلسات النشطة</h2>
                <p className="mt-1 text-sm text-slate-500">إبطال الجلسة يمنع استخدام refresh token فوراً.</p>
              </div>
            </div>
            <button type="button" onClick={() => void revokeAllSessions()} disabled={saving || !sessions.length} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              <LogOut className="h-4 w-4" /> تسجيل الخروج من كل الأجهزة
            </button>
          </div>
          {loading ? <p className="p-5 text-sm text-slate-500">جارٍ تحميل الجلسات...</p> : sessions.length ? (
            <ul className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{deviceName(session.user_agent)}</div>
                    <div className="mt-1 break-all text-xs text-slate-500">{session.user_agent}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      دخول {new Date(session.created_at).toLocaleString("ar-SA")} · تنتهي {new Date(session.expires_at).toLocaleDateString("ar-SA")}
                    </div>
                  </div>
                  <button type="button" onClick={() => void revokeSession(session.id)} disabled={revoking === session.id} className="min-h-10 rounded-full border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                    {revoking === session.id ? "جارٍ الإبطال..." : "إبطال الجلسة"}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="p-5 text-sm text-slate-500">لا توجد جلسات نشطة أخرى.</p>}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-sky-700" />
            <div>
              <h2 className="font-semibold text-slate-950">تغيير كلمة المرور</h2>
              <p className="mt-1 text-sm text-slate-500">سيتم إنهاء جميع الجلسات بعد التغيير.</p>
            </div>
          </div>
          <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">كلمة المرور الحالية
              <input name="current_password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
            </label>
            <label className="text-sm font-semibold text-slate-700">كلمة المرور الجديدة
              <input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
              <span className="mt-1 block text-xs font-normal text-slate-500">12 حرفاً على الأقل، وثلاثة أنواع من الأحرف أو الأرقام أو الرموز.</span>
            </label>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-sky-700 px-5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50 sm:col-span-2">
              <ShieldCheck className="h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "تغيير كلمة المرور وإنهاء الجلسات"}
            </button>
          </form>
        </section>
      </div>
    </DashboardShell>
  );
}