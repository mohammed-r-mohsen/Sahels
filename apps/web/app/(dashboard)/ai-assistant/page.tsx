"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { Bot, CalendarClock, ShieldAlert } from "lucide-react";

type AiSettings = {
  enabled: boolean;
  arabic_model: string;
  booking_model: string;
};

type NoShowPrediction = {
  appointment_id: string;
  patient_id: string;
  patient_name: string | null;
  doctor_name: string;
  starts_at: string;
  no_show_count: number;
  visit_count: number;
  risk_score: number | null;
  risk_level: "high" | "moderate" | "low" | "insufficient_data";
};

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "تعذر تحميل بيانات المساعد.";
}

function riskLabel(prediction: NoShowPrediction) {
  if (prediction.risk_level === "insufficient_data") return "بيانات غير كافية";
  if (prediction.risk_level === "high") return "مرتفع";
  if (prediction.risk_level === "moderate") return "متوسط";
  return "منخفض";
}

export default function AiAssistantPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [predictions, setPredictions] = useState<NoShowPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ ai: AiSettings }>("/clinic/integrations"),
      api<NoShowPrediction[]>("/analytics/no-show-risk?days=7"),
    ])
      .then(([integrations, risk]) => {
        setSettings(integrations.ai);
        setPredictions(risk);
      })
      .catch((loadError: unknown) => setError(errorMessage(loadError)))
      .finally(() => setLoading(false));
  }, []);

  async function toggleAssistant() {
    if (!settings) return;
    setSaving(true);
    setError("");
    const enabled = !settings.enabled;
    try {
      await api("/clinic/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          arabic_model: settings.arabic_model,
          booking_model: settings.booking_model,
        }),
      });
      setSettings({ ...settings, enabled });
    } catch (saveError: unknown) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const highRiskCount = predictions.filter((prediction) => prediction.risk_level === "high").length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">المساعد الذكي</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">الردود ومؤشرات الحضور</h1>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {loading ? (
          <div className="card p-6 text-slate-500">جارٍ تحميل بيانات المساعد...</div>
        ) : settings ? (
          <>
            <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-black text-slate-900">مساعد رسائل المرضى</h2>
                  <p className="mt-1 text-sm text-slate-500">Ollama · {settings.booking_model}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {settings.enabled ? "الرد الآلي مفعّل لقناة WhatsApp المتصلة." : "الرد الآلي متوقف."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                aria-label="تفعيل الرد الآلي"
                onClick={toggleAssistant}
                disabled={saving}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${settings.enabled ? "bg-emerald-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${settings.enabled ? "right-1" : "left-1"}`} />
              </button>
            </section>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-slate-500"><Bot className="h-4 w-4" />حالة المساعد</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{settings.enabled ? "مفعّل" : "متوقف"}</div>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarClock className="h-4 w-4" />مواعيد خلال 7 أيام</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{predictions.length}</div>
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-2 text-sm text-slate-500"><ShieldAlert className="h-4 w-4" />مؤشر مرتفع</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{highRiskCount}</div>
              </div>
            </div>

            <section className="card overflow-hidden">
              <div className="border-b border-slate-200 p-5">
                <h2 className="font-black text-slate-900">مواعيد تحتاج تذكيراً مبكراً</h2>
                <p className="mt-1 text-sm text-slate-500">
                  تقدير تاريخي من حالات عدم الحضور والزيارات المكتملة؛ لا يضمن سلوك المريض.
                </p>
              </div>
              {predictions.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">لا توجد مواعيد قادمة خلال الأيام السبعة المقبلة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-5 py-3 font-semibold">المريض</th>
                        <th className="px-5 py-3 font-semibold">الطبيب</th>
                        <th className="px-5 py-3 font-semibold">الموعد</th>
                        <th className="px-5 py-3 font-semibold">سجل الحضور</th>
                        <th className="px-5 py-3 font-semibold">المؤشر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {predictions.map((prediction) => (
                        <tr key={prediction.appointment_id}>
                          <td className="px-5 py-4 font-semibold text-slate-900">{prediction.patient_name || "اسم غير مسجل"}</td>
                          <td className="px-5 py-4 text-slate-600">{prediction.doctor_name}</td>
                          <td className="px-5 py-4 text-slate-600">
                            {new Date(prediction.starts_at).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                          <td className="px-5 py-4 text-slate-600">{prediction.no_show_count} غياب · {prediction.visit_count} حضور</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${prediction.risk_level === "high" ? "bg-rose-100 text-rose-700" : prediction.risk_level === "moderate" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                              {riskLabel(prediction)}{prediction.risk_score !== null ? ` · ${Math.round(prediction.risk_score * 100)}%` : ""}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
