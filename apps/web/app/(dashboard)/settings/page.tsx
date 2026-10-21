"use client";

import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { Save } from "lucide-react";

type Clinic = {
  name: string;
  logo_url: string | null;
  city: string | null;
  address: string | null;
  timezone: string;
  reminder_hours: number;
  channels: { whatsapp: boolean; instagram: boolean };
};

function message(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "تعذر تنفيذ الطلب.";
}

export default function SettingsPage() {
  const [clinic, setClinic] = useState<Clinic>({
    name: "",
    logo_url: null,
    city: null,
    address: null,
    timezone: "Asia/Riyadh",
    reminder_hours: 3,
    channels: { whatsapp: true, instagram: false },
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Clinic>("/clinic")
      .then(setClinic)
      .catch((loadError: unknown) => setError(message(loadError)))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<Clinic>("/clinic", {
        method: "PUT",
        body: JSON.stringify(clinic),
      });
      setClinic(updated);
      setNotice("تم حفظ إعدادات العيادة.");
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Clinic>(key: K, value: Clinic[K]) {
    setClinic((current) => ({ ...current, [key]: value }));
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الإعدادات</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إعدادات العيادة</h1>
          <p className="mt-2 text-slate-500">إدارة ملف العيادة والمنطقة الزمنية والتذكيرات وقنوات التواصل.</p>
        </div>

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {loading ? <div className="card p-6 text-slate-500">جارٍ تحميل إعدادات العيادة...</div> :
          <form onSubmit={saveSettings} className="card space-y-6 p-6">
            <section>
              <h2 className="mb-4 text-xl font-black">الملف التعريفي</h2>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">اسم العيادة
                  <input required maxLength={160} value={clinic.name} onChange={(event) => update("name", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right" />
                </label>
                <label className="text-sm font-semibold text-slate-700">المدينة
                  <input maxLength={120} value={clinic.city || ""} onChange={(event) => update("city", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right" />
                </label>
                <label className="text-sm font-semibold text-slate-700">رابط الشعار
                  <input type="url" value={clinic.logo_url || ""} onChange={(event) => update("logo_url", event.target.value)} placeholder="https://" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                </label>
                <label className="text-sm font-semibold text-slate-700">المنطقة الزمنية
                  <select value={clinic.timezone} onChange={(event) => update("timezone", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <option value="Asia/Riyadh">الرياض (Asia/Riyadh)</option>
                    <option value="Asia/Dubai">دبي (Asia/Dubai)</option>
                    <option value="Asia/Kuwait">الكويت (Asia/Kuwait)</option>
                    <option value="Asia/Amman">عمّان (Asia/Amman)</option>
                    <option value="Africa/Cairo">القاهرة (Africa/Cairo)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">العنوان
                  <textarea rows={3} maxLength={500} value={clinic.address || ""} onChange={(event) => update("address", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-right" />
                </label>
              </div>
            </section>

            <section className="border-t border-slate-100 pt-6">
              <h2 className="mb-4 text-xl font-black">التذكيرات والقنوات</h2>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">التذكير قبل الموعد (بالساعات)
                  <input required type="number" min={1} max={168} value={clinic.reminder_hours} onChange={(event) => update("reminder_hours", Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3" />
                </label>
                <div className="space-y-3">
                  <span className="block text-sm font-semibold text-slate-700">القنوات المفعلة</span>
                  {(["whatsapp", "instagram"] as const).map((channel) => (
                    <label key={channel} className="flex items-center gap-3 text-sm text-slate-700">
                      <input type="checkbox" checked={clinic.channels?.[channel] ?? false} onChange={(event) => update("channels", { ...clinic.channels, [channel]: event.target.checked })} className="h-4 w-4 accent-sky-600" />
                      {channel === "whatsapp" ? "واتساب" : "إنستغرام"}
                    </label>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">تفعيل القناة هنا يحفظ تفضيل العيادة فقط؛ إعداد بيانات الربط يتم من صفحة التكاملات.</p>
            </section>

            <button disabled={saving} className="btn-primary disabled:opacity-50"><Save className="ml-2 h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button>
          </form>}
      </div>
    </DashboardShell>
  );
}
