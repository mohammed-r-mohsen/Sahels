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

type ChannelSettings = {
  enabled: boolean;
  external_id: string;
  phone_number_id: string | null;
  business_account_id: string | null;
  page_id: string | null;
  access_token_configured: boolean;
};

type IntegrationSettings = {
  whatsapp: ChannelSettings;
  instagram: ChannelSettings;
  ai: {
    provider: string;
    enabled: boolean;
    ollama_base_url: string;
    arabic_model: string;
    booking_model: string;
  };
};

const emptyChannel: ChannelSettings = {
  enabled: false,
  external_id: "",
  phone_number_id: null,
  business_account_id: null,
  page_id: null,
  access_token_configured: false,
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
    reminder_hours: 4,
    channels: { whatsapp: true, instagram: false },
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrationError, setIntegrationError] = useState("");
  const [integrationNotice, setIntegrationNotice] = useState("");
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationSettings>({
    whatsapp: emptyChannel,
    instagram: emptyChannel,
    ai: {
      provider: "ollama",
      enabled: false,
      ollama_base_url: "http://ollama:11434",
      arabic_model: "allam:7b",
      booking_model: "qwen2.5:7b",
    },
  });
  const [tokens, setTokens] = useState({ whatsapp: "", instagram: "" });
  const [clearTokens, setClearTokens] = useState({ whatsapp: false, instagram: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<Clinic>("/clinic"), api<IntegrationSettings>("/clinic/integrations")])
      .then(([clinicSettings, integrationSettings]) => {
        setClinic(clinicSettings);
        setIntegrations(integrationSettings);
      })
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

  async function saveIntegrations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntegrationSaving(true);
    setIntegrationError("");
    setIntegrationNotice("");
    try {
      await api("/clinic/integrations", {
        method: "PUT",
        body: JSON.stringify({
          whatsapp: {
            enabled: integrations.whatsapp.enabled,
            phone_number_id: integrations.whatsapp.phone_number_id,
            business_account_id: integrations.whatsapp.business_account_id,
            access_token: tokens.whatsapp || null,
            clear_access_token: clearTokens.whatsapp,
          },
          instagram: {
            enabled: integrations.instagram.enabled,
            instagram_account_id: integrations.instagram.external_id,
            page_id: integrations.instagram.page_id,
            access_token: tokens.instagram || null,
            clear_access_token: clearTokens.instagram,
          },
        }),
      });
      setIntegrations(await api<IntegrationSettings>("/clinic/integrations"));
      setTokens({ whatsapp: "", instagram: "" });
      setClearTokens({ whatsapp: false, instagram: false });
      setIntegrationNotice("تم حفظ إعدادات القنوات بأمان.");
    } catch (saveError) {
      setIntegrationError(message(saveError));
    } finally {
      setIntegrationSaving(false);
    }
  }

  async function saveAiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAiSaving(true);
    setIntegrationError("");
    setIntegrationNotice("");
    try {
      await api("/clinic/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: integrations.ai.enabled,
          arabic_model: integrations.ai.arabic_model,
          booking_model: integrations.ai.booking_model,
        }),
      });
      setIntegrationNotice("تم حفظ إعدادات نماذج الذكاء الاصطناعي.");
    } catch (saveError) {
      setIntegrationError(message(saveError));
    } finally {
      setAiSaving(false);
    }
  }

  function updateChannel(
    channel: "whatsapp" | "instagram",
    changes: Partial<ChannelSettings>,
  ) {
    setIntegrations((current) => ({
      ...current,
      [channel]: { ...current[channel], ...changes },
    }));
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
                <div className="text-sm font-semibold text-slate-700">تذكير الموعد
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal">رسالة واتساب قبل الموعد بـ4 ساعات</div>
                </div>
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
              <p className="mt-3 text-xs text-slate-500">هذه تفضيلات الملف فقط؛ تفعيل الربط وحفظ بيانات Meta يتم في قسم تكاملات القنوات أدناه.</p>
            </section>

            <button disabled={saving} className="btn-primary disabled:opacity-50"><Save className="ml-2 h-4 w-4" />{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button>
          </form>}

        {!loading && (
          <>
            <form onSubmit={saveIntegrations} className="card space-y-6 p-6">
              <section>
                <h2 className="text-xl font-black">تكاملات قنوات التواصل</h2>
                <p className="mt-2 text-sm text-slate-500">تُشفّر رموز الوصول عند التخزين ولا يعيدها الخادم إلى المتصفح. اترك الرمز فارغًا للإبقاء على الرمز الحالي.</p>
              </section>
              {integrationError && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{integrationError}</p>}
              {integrationNotice && <p role="status" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{integrationNotice}</p>}

              <section className="space-y-5 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">WhatsApp Cloud API</h3>
                    <p className="text-sm text-slate-500">{integrations.whatsapp.access_token_configured ? "رمز وصول محفوظ" : "لم يُحفظ رمز وصول"}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={integrations.whatsapp.enabled} onChange={(event) => updateChannel("whatsapp", { enabled: event.target.checked })} className="h-4 w-4 accent-sky-600" />
                    تفعيل الربط
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">معرّف رقم الهاتف (Phone Number ID)
                    <input value={integrations.whatsapp.phone_number_id || ""} onChange={(event) => updateChannel("whatsapp", { phone_number_id: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">معرّف حساب WhatsApp Business
                    <input value={integrations.whatsapp.business_account_id || ""} onChange={(event) => updateChannel("whatsapp", { business_account_id: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  <label className="text-sm font-semibold text-slate-700 md:col-span-2">Access Token
                    <input type="password" autoComplete="new-password" value={tokens.whatsapp} onChange={(event) => { setTokens((current) => ({ ...current, whatsapp: event.target.value })); setClearTokens((current) => ({ ...current, whatsapp: false })); }} placeholder={integrations.whatsapp.access_token_configured ? "اتركه فارغًا للإبقاء على الرمز الحالي" : "أدخل رمز الوصول"} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  {integrations.whatsapp.access_token_configured && <label className="flex items-center gap-2 text-sm text-red-700 md:col-span-2">
                    <input type="checkbox" checked={clearTokens.whatsapp} onChange={(event) => setClearTokens((current) => ({ ...current, whatsapp: event.target.checked }))} className="h-4 w-4 accent-red-600" />
                    حذف رمز الوصول المحفوظ
                  </label>}
                </div>
              </section>

              <section className="space-y-5 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">Instagram Messaging API</h3>
                    <p className="text-sm text-slate-500">{integrations.instagram.access_token_configured ? "رمز وصول محفوظ" : "لم يُحفظ رمز وصول"}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={integrations.instagram.enabled} onChange={(event) => updateChannel("instagram", { enabled: event.target.checked })} className="h-4 w-4 accent-sky-600" />
                    تفعيل الربط
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">معرّف حساب Instagram الاحترافي
                    <input value={integrations.instagram.external_id} onChange={(event) => updateChannel("instagram", { external_id: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">معرّف صفحة Facebook المرتبطة
                    <input value={integrations.instagram.page_id || ""} onChange={(event) => updateChannel("instagram", { page_id: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  <label className="text-sm font-semibold text-slate-700 md:col-span-2">Access Token
                    <input type="password" autoComplete="new-password" value={tokens.instagram} onChange={(event) => { setTokens((current) => ({ ...current, instagram: event.target.value })); setClearTokens((current) => ({ ...current, instagram: false })); }} placeholder={integrations.instagram.access_token_configured ? "اتركه فارغًا للإبقاء على الرمز الحالي" : "أدخل رمز الوصول"} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                  </label>
                  {integrations.instagram.access_token_configured && <label className="flex items-center gap-2 text-sm text-red-700 md:col-span-2">
                    <input type="checkbox" checked={clearTokens.instagram} onChange={(event) => setClearTokens((current) => ({ ...current, instagram: event.target.checked }))} className="h-4 w-4 accent-red-600" />
                    حذف رمز الوصول المحفوظ
                  </label>}
                </div>
                <p className="text-xs text-amber-700">حفظ بيانات Instagram يجهّز إعداداتها فقط؛ استقبال رسائل Instagram وإرسالها يحتاج استكمال webhook ومعالجة القناة في الخادم.</p>
              </section>

              <button disabled={integrationSaving} className="btn-primary disabled:opacity-50"><Save className="ml-2 h-4 w-4" />{integrationSaving ? "جارٍ الحفظ..." : "حفظ إعدادات القنوات"}</button>
            </form>

            <form onSubmit={saveAiSettings} className="card space-y-5 p-6">
              <section>
                <h2 className="text-xl font-black">إعدادات نماذج الذكاء الاصطناعي</h2>
                <p className="mt-2 text-sm text-slate-500">الخدمة محلية عبر Ollama. عنوان الخادم يحدده مشغّل المنصة، ويمكن تخصيص أسماء النماذج لهذه العيادة.</p>
              </section>
              {integrationError && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{integrationError}</p>}
              {integrationNotice && <p role="status" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{integrationNotice}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">عنوان Ollama (للقراءة فقط)
                  <input readOnly value={integrations.ai.ollama_base_url} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-slate-500" />
                </label>
                <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
                  <input type="checkbox" checked={integrations.ai.enabled} onChange={(event) => setIntegrations((current) => ({ ...current, ai: { ...current.ai, enabled: event.target.checked } }))} className="h-4 w-4 accent-sky-600" />
                  تفعيل إعدادات الذكاء الاصطناعي
                </label>
                <label className="text-sm font-semibold text-slate-700">نموذج اللغة العربية
                  <input required maxLength={120} value={integrations.ai.arabic_model} onChange={(event) => setIntegrations((current) => ({ ...current, ai: { ...current.ai, arabic_model: event.target.value } }))} placeholder="allam:7b" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                </label>
                <label className="text-sm font-semibold text-slate-700">نموذج تنظيم الحجوزات والمهام
                  <input required maxLength={120} value={integrations.ai.booking_model} onChange={(event) => setIntegrations((current) => ({ ...current, ai: { ...current.ai, booking_model: event.target.value } }))} placeholder="qwen2.5:7b" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-left" />
                </label>
              </div>
              <p className="text-xs text-amber-700">حفظ النماذج لا يفعّل الرد الآلي بحد ذاته؛ ربط محرك المحادثة بالنماذج سيأتي ضمن تنفيذ نظام الذكاء الاصطناعي.</p>
              <button disabled={aiSaving} className="btn-primary disabled:opacity-50"><Save className="ml-2 h-4 w-4" />{aiSaving ? "جارٍ الحفظ..." : "حفظ إعدادات النماذج"}</button>
            </form>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
