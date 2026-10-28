"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { CreditCard, ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";

type Plan = { id: string; name_ar: string; price_sar: string };
type Subscription = { plan_id: string | null; status: string; ends_at: string | null };
type Invoice = {
  id: string;
  amount_sar: string;
  currency: string;
  provider: string;
  status: string;
  purpose: string;
  plan_id: string | null;
  checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
};
type Checkout = { payment_id: string; checkout_url: string; status: string };

function errorText(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "تعذر تحميل بيانات الفوترة.";
}

function money(value: string) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(value));
}

function statusText(status: string) {
  if (status === "active") return "نشط";
  if (status === "trial") return "تجريبي";
  if (status === "past_due") return "متأخر السداد";
  if (status === "suspended") return "موقوف";
  if (status === "paid") return "مدفوع";
  if (status === "failed") return "فشل الدفع";
  return "بانتظار الدفع";
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadBilling() {
      try {
        const [planRows, currentSubscription, invoiceRows] = await Promise.all([
          api<Plan[]>("/billing/plans"),
          api<Subscription>("/billing/subscription"),
          api<Invoice[]>("/billing/invoices"),
        ]);
        if (!active) return;
        setPlans(planRows);
        setSubscription(currentSubscription);
        setInvoices(invoiceRows);

        const paymentId = new URLSearchParams(window.location.search).get("payment_id");
        if (paymentId) {
          const verified = await api<{ status: string }>(`/billing/verify/${encodeURIComponent(paymentId)}`, { method: "POST" });
          if (!active) return;
          setNotice(verified.status === "paid" ? "تم تأكيد الدفع وتفعيل الاشتراك." : "لم يؤكد مزود الدفع اكتمال العملية بعد.");
          const [updatedSubscription, updatedInvoices] = await Promise.all([
            api<Subscription>("/billing/subscription"),
            api<Invoice[]>("/billing/invoices"),
          ]);
          if (!active) return;
          setSubscription(updatedSubscription);
          setInvoices(updatedInvoices);
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch (loadError: unknown) {
        if (active) setError(errorText(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadBilling();
    return () => { active = false; };
  }, []);

  async function choosePlan(planId: string) {
    setPendingPlan(planId);
    setError("");
    try {
      const checkout = await api<Checkout>("/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      });
      const checkoutUrl = new URL(checkout.checkout_url);
      if (checkoutUrl.protocol !== "https:") throw new Error("رابط الدفع غير آمن.");
      window.location.assign(checkoutUrl.toString());
    } catch (checkoutError: unknown) {
      setError(errorText(checkoutError));
      setPendingPlan("");
    }
  }

  const currentPlan = plans.find((plan) => plan.id === subscription?.plan_id);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الفواتير والاشتراكات</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة الدفع والاشتراك</h1>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        {loading ? (
          <div className="card flex items-center gap-3 p-6 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />جارٍ تحميل الفواتير والخطط...</div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="card p-5">
                <div className="text-sm text-slate-500">حالة الاشتراك</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{statusText(subscription?.status || "")}</div>
              </div>
              <div className="card p-5">
                <div className="text-sm text-slate-500">الخطة الحالية</div>
                <div className="mt-3 text-2xl font-black text-slate-900">{currentPlan?.name_ar || "لا توجد خطة"}</div>
              </div>
              <div className="card p-5">
                <div className="text-sm text-slate-500">انتهاء الاشتراك</div>
                <div className="mt-3 text-lg font-black text-slate-900">
                  {subscription?.ends_at ? new Date(subscription.ends_at).toLocaleDateString("ar-SA") : "غير محدد"}
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900">الخطط الشهرية</h2>
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />الدفع عبر Moyasar</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((plan) => (
                  <article key={plan.id} className={`card p-5 ${plan.id === subscription?.plan_id ? "border-sky-500" : ""}`}>
                    <h3 className="font-black text-slate-900">{plan.name_ar}</h3>
                    <div className="mt-3 text-3xl font-black text-slate-900">{money(plan.price_sar)}</div>
                    <div className="mt-1 text-sm text-slate-500">شهرياً</div>
                    <button
                      type="button"
                      onClick={() => choosePlan(plan.id)}
                      disabled={Boolean(pendingPlan)}
                      className="btn-primary mt-5 w-full disabled:opacity-60"
                    >
                      {pendingPlan === plan.id ? "جارٍ إنشاء الفاتورة..." : plan.id === subscription?.plan_id ? "تجديد أو تغيير الخطة" : "اختيار الخطة"}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-slate-200 p-5">
                <h2 className="flex items-center gap-2 font-black text-slate-900"><CreditCard className="h-5 w-5 text-sky-700" />سجل الفواتير</h2>
              </div>
              {invoices.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">لا توجد فواتير حتى الآن.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-5 py-3 font-semibold">التاريخ</th>
                        <th className="px-5 py-3 font-semibold">الخطة</th>
                        <th className="px-5 py-3 font-semibold">المبلغ</th>
                        <th className="px-5 py-3 font-semibold">الحالة</th>
                        <th className="px-5 py-3 font-semibold">الفاتورة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-5 py-4">{new Date(invoice.created_at).toLocaleDateString("ar-SA")}</td>
                          <td className="px-5 py-4">{plans.find((plan) => plan.id === invoice.plan_id)?.name_ar || invoice.plan_id || "-"}</td>
                          <td className="px-5 py-4 font-semibold">{money(invoice.amount_sar)}</td>
                          <td className="px-5 py-4">{statusText(invoice.status)}</td>
                          <td className="px-5 py-4">
                            {invoice.checkout_url && invoice.status === "pending" ? (
                              <a href={invoice.checkout_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700">
                                استكمال الدفع <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString("ar-SA") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
