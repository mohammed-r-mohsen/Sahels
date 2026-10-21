"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError } from "@/lib/api";
import { Plus, Save, UserRoundPlus } from "lucide-react";

type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "doctor" | "receptionist";
  is_active: boolean;
};

type Shift = {
  weekday: number;
  start_time: string;
  end_time: string;
};

const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const emptyShifts: Shift[] = [];

function serializeShift(shift: Shift) {
  return {
    ...shift,
    start_time: shift.start_time.length === 5 ? `${shift.start_time}:00` : shift.start_time,
    end_time: shift.end_time.length === 5 ? `${shift.end_time}:00` : shift.end_time,
  };
}

function message(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "تعذر تنفيذ الطلب.";
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [shifts, setShifts] = useState<Shift[]>(emptyShifts);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"doctor" | "receptionist">("receptionist");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      setStaff(await api<StaffMember[]>("/clinic/staff"));
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function chooseStaff(member: StaffMember) {
    setSelected(member);
    setFullName(member.full_name);
    setPhone(member.phone || "");
    setRole(member.role);
    setError("");
    try {
      const rows = await api<Shift[]>(`/clinic/staff/${member.id}/shifts`);
      setShifts(rows.map((row) => ({
        ...row,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      })));
    } catch (loadError) {
      setError(message(loadError));
    }
  }

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await api<StaffMember>("/clinic/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || null,
          role,
          password,
        }),
      });
      setPassword("");
      setNotice(`تمت إضافة ${created.full_name}. شارك كلمة المرور الأولية معه خارج النظام؛ تغيير كلمة المرور غير متاح حالياً.`);
      await loadStaff();
      await chooseStaff(created);
    } catch (createError) {
      setError(message(createError));
    } finally {
      setSaving(false);
    }
  }

  function setDay(day: number, enabled: boolean) {
    setShifts((current) => enabled
      ? [...current, { weekday: day, start_time: "09:00", end_time: "17:00" }].sort((a, b) => a.weekday - b.weekday)
      : current.filter((shift) => shift.weekday !== day));
  }

  function updateShift(day: number, field: "start_time" | "end_time", value: string) {
    setShifts((current) => current.map((shift) => shift.weekday === day ? { ...shift, [field]: value } : shift));
  }

  async function saveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<StaffMember>(`/clinic/staff/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          role,
          is_active: selected.is_active,
        }),
      });
      await api(`/clinic/staff/${selected.id}/shifts`, {
        method: "PUT",
        body: JSON.stringify(shifts.map(serializeShift)),
      });
      setSelected(updated);
      setNotice("تم حفظ بيانات الموظف ووردياته.");
      await loadStaff();
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member: StaffMember) {
    setError("");
    try {
      await api(`/clinic/staff/${member.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      await loadStaff();
      if (selected?.id === member.id) {
        setSelected({ ...member, is_active: !member.is_active });
      }
    } catch (toggleError) {
      setError(message(toggleError));
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">فريق العيادة</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة الموظفين والورديات</h1>
          <p className="mt-2 text-slate-500">أضف حسابات الموظفين، حدّد الصلاحيات، ونظّم أيام وساعات العمل.</p>
        </div>
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="card p-5">
            <h2 className="mb-4 text-xl font-black">موظفو العيادة</h2>
            {loading ? <p className="text-sm text-slate-500">جارٍ تحميل الفريق...</p> :
              staff.length ? <ul className="divide-y divide-slate-100">
                {staff.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                    <button onClick={() => void chooseStaff(member)} className="text-right">
                      <span className="block font-bold">{member.full_name}</span>
                      <span className="text-xs text-slate-500">{member.email} · {member.role === "doctor" ? "طبيب" : "استقبال"}</span>
                    </button>
                    <button onClick={() => void toggleActive(member)} className={`chip ${member.is_active ? "" : "bg-slate-100 text-slate-600"}`}>
                      {member.is_active ? "نشط" : "معطل"}
                    </button>
                  </li>
                ))}
              </ul> : <p className="py-3 text-sm text-slate-500">لم تتم إضافة أي موظفين بعد.</p>}
          </section>

          <section className="card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black">{selected ? "بيانات الموظف والورديات" : "إضافة موظف"}</h2>
              {selected && <button type="button" onClick={() => { setSelected(null); setFullName(""); setEmail(""); setPhone(""); setPassword(""); setShifts([]); }} className="btn-secondary"><Plus className="ml-2 h-4 w-4" /> موظف جديد</button>}
            </div>
            <form onSubmit={selected ? saveStaff : addStaff} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">الاسم الكامل
                  <input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-right" />
                </label>
                {!selected && <label className="text-sm font-semibold">البريد الإلكتروني
                  <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-left" />
                </label>}
                <label className="text-sm font-semibold">رقم الهاتف
                  <input maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-right" />
                </label>
                <label className="text-sm font-semibold">الصلاحية
                  <select value={role} onChange={(event) => setRole(event.target.value as "doctor" | "receptionist")} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">
                    <option value="receptionist">موظف استقبال</option>
                    <option value="doctor">طبيب</option>
                  </select>
                </label>
                {!selected && <label className="text-sm font-semibold sm:col-span-2">كلمة مرور أولية (12 حرفاً على الأقل)
                  <input required type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" />
                </label>}
              </div>
              {selected && <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="font-bold">الورديات الأسبوعية</h3>
                {weekdays.map((day, index) => {
                  const shift = shifts.find((item) => item.weekday === index);
                  return <div key={day} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-sm">
                    <label className="flex w-24 items-center gap-2"><input type="checkbox" checked={Boolean(shift)} onChange={(event) => setDay(index, event.target.checked)} />{day}</label>
                    <input aria-label={`بداية وردية ${day}`} type="time" disabled={!shift} value={shift?.start_time || "09:00"} onChange={(event) => updateShift(index, "start_time", event.target.value)} className="rounded-lg border p-2 disabled:opacity-40" />
                    <input aria-label={`نهاية وردية ${day}`} type="time" disabled={!shift} value={shift?.end_time || "17:00"} onChange={(event) => updateShift(index, "end_time", event.target.value)} className="rounded-lg border p-2 disabled:opacity-40" />
                    <span className="text-xs text-slate-400">{shift ? "مفعلة" : "إجازة"}</span>
                  </div>;
                })}
              </div>}
              {!selected && <p className="text-xs text-amber-700">تغيير كلمة المرور من داخل النظام غير متاح حالياً؛ شارك كلمة المرور الأولية مع الموظف عبر قناة آمنة.</p>}
              <button disabled={saving} className="btn-primary disabled:opacity-50">
                {selected ? <Save className="ml-2 h-4 w-4" /> : <UserRoundPlus className="ml-2 h-4 w-4" />}
                {saving ? "جارٍ الحفظ..." : selected ? "حفظ بيانات الموظف والورديات" : "إضافة الموظف"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
