"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { Check, MessageSquareText, RefreshCw } from "lucide-react";

type HandoffMessage = {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  channel: string;
  body: string | null;
  created_at: string;
};

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "تعذر تنفيذ الطلب.";
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<HandoffMessage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState("");

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await api<HandoffMessage[]>("/clinic/handoffs"));
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
    const interval = window.setInterval(() => void loadMessages(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadMessages]);

  async function resolveMessage(id: string) {
    setResolving(id);
    setError("");
    try {
      await api(`/clinic/handoffs/${id}/resolve`, { method: "PATCH" });
      setMessages((current) => current.filter((message) => message.id !== id));
    } catch (resolveError) {
      setError(errorMessage(resolveError));
    } finally {
      setResolving("");
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold tracking-[0.2em] text-sky-700">صندوق المحادثات</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">طلبات متابعة المرضى</h1>
            <p className="mt-2 text-slate-500">طلبات التواصل مع موظف العيادة والإبلاغ عن احتمال التأخر.</p>
          </div>
          <button type="button" onClick={() => void loadMessages()} className="btn-secondary" aria-label="تحديث الطلبات">
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </button>
        </div>

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? <div className="card p-6 text-slate-500">جارٍ تحميل طلبات المتابعة...</div> :
          messages.length ? <div className="space-y-3">
            {messages.map((message) => (
              <article key={message.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <div className="mt-1 rounded-xl bg-amber-100 p-2 text-amber-700">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-900">{message.patient_name || "مريض"}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{message.body || "طلب المريض التحدث مع فريق العيادة."}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      {message.channel} · {new Date(message.created_at).toLocaleString("ar-SA")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {message.patient_phone && (
                    <a
                      href={`https://wa.me/${message.patient_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      تواصل مع المريض
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void resolveMessage(message.id)}
                    disabled={resolving === message.id}
                    className="btn-primary disabled:opacity-50"
                  >
                    <Check className="ml-2 h-4 w-4" />
                    {resolving === message.id ? "جارٍ الإغلاق..." : "تمت المتابعة"}
                  </button>
                </div>
              </article>
            ))}
          </div> : <div className="card p-8 text-center text-slate-500">لا توجد طلبات متابعة مفتوحة.</div>}
      </div>
    </DashboardShell>
  );
}
