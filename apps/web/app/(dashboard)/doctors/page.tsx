"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { api, ApiError, CurrentSession } from "@/lib/api";
import { Plus, Save, Search, Trash2 } from "lucide-react";

type Doctor = {
  id: string;
  full_name: string;
  specialty: string | null;
  slot_minutes: number;
  capacity_per_slot: number;
  is_active: boolean;
};

type Schedule = {
  weekday: number;
  start_time: string;
  end_time: string;
};

const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function serializeSchedule(schedule: Schedule) {
  return {
    ...schedule,
    start_time: schedule.start_time.length === 5 ? `${schedule.start_time}:00` : schedule.start_time,
    end_time: schedule.end_time.length === 5 ? `${schedule.end_time}:00` : schedule.end_time,
  };
}

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "تعذر تنفيذ الطلب.";
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [capacity, setCapacity] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const loadDoctors = useCallback(async () => {
    try {
      setDoctors(await api<Doctor[]>("/clinic/doctors"));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctors();
    api<CurrentSession>("/auth/me")
      .then((session) => setCanManage(session.role === "clinic_admin"))
      .catch((loadError: unknown) => setError(errorMessage(loadError)));
  }, [loadDoctors]);

  async function selectDoctor(doctor: Doctor) {
    setError("");
    setSelectedId(doctor.id);
    setName(doctor.full_name);
    setSpecialty(doctor.specialty || "");
    setSlotMinutes(doctor.slot_minutes);
    setCapacity(doctor.capacity_per_slot);
    setIsActive(doctor.is_active);
    try {
      const rows = await api<Schedule[]>(`/clinic/doctors/${doctor.id}/schedule`);
      setSchedules(rows.map((row) => ({
        ...row,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      })));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  async function createDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const doctor = await api<Doctor>("/clinic/doctors", {
        method: "POST",
        body: JSON.stringify({
          full_name: name,
          specialty: specialty || null,
          slot_minutes: slotMinutes,
          capacity_per_slot: capacity,
        }),
      });
      await loadDoctors();
      await selectDoctor(doctor);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function updateSchedule(day: number, field: "start_time" | "end_time", value: string) {
    setSchedules((current) => {
      const found = current.find((item) => item.weekday === day);
      if (!found) {
        const newSchedule = {
          weekday: day,
          start_time: field === "start_time" ? value : "09:00",
          end_time: field === "end_time" ? value : "17:00",
        };
        return [...current, newSchedule].sort((a, b) => a.weekday - b.weekday);
      }
      return current.map((item) => item.weekday === day ? { ...item, [field]: value } : item);
    });
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await api(`/clinic/doctors/${selectedId}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: name,
          specialty,
          slot_minutes: slotMinutes,
          capacity_per_slot: capacity,
          is_active: isActive,
        }),
      });
      await api(`/clinic/doctors/${selectedId}/schedule`, {
        method: "PUT",
        body: JSON.stringify(schedules.map(serializeSchedule)),
      });
      await loadDoctors();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const filteredDoctors = doctors.filter((doctor) =>
    `${doctor.full_name} ${doctor.specialty || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">الأطباء</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">إدارة الفريق الطبي</h1>
        </div>

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!canManage && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">عرض فقط. إدارة الأطباء وجداولهم متاحة لمدير العيادة.</p>}

        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">الأطباء المسجلون</h2>
              <span className="chip">{doctors.length} طبيب</span>
            </div>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <Search className="h-4 w-4 text-slate-500" />
              <input aria-label="بحث عن طبيب" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو التخصص" className="w-full bg-transparent text-right outline-none" />
            </div>
            {loading ? <p className="py-4 text-sm text-slate-500">جارٍ تحميل الأطباء...</p> :
              filteredDoctors.length ? <ul className="divide-y divide-slate-100">
                {filteredDoctors.map((doctor) => (
                  <li key={doctor.id} className="flex items-center justify-between gap-3 py-3">
                    <button onClick={() => void selectDoctor(doctor)} className="text-right">
                      <span className="block font-bold">{doctor.full_name}</span>
                      <span className="text-sm text-slate-500">{doctor.specialty || "بدون تخصص"}</span>
                    </button>
                    <span className={`chip ${doctor.is_active ? "" : "bg-slate-100 text-slate-500"}`}>{doctor.is_active ? "نشط" : "غير نشط"}</span>
                  </li>
                ))}
              </ul> : <p className="py-4 text-sm text-slate-500">لا يوجد أطباء بعد. أضف أول طبيب للعيادة.</p>}
          </section>

          <section className="card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black">{selectedId ? "بيانات الطبيب وجدوله" : "إضافة طبيب"}</h2>
              {selectedId && canManage && <button type="button" onClick={() => { setSelectedId(""); setName(""); setSpecialty(""); setSchedules([]); }} className="btn-secondary"><Plus className="ml-2 h-4 w-4" /> طبيب جديد</button>}
            </div>
            <form onSubmit={selectedId ? saveDoctor : createDoctor} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">اسم الطبيب
                  <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-right disabled:bg-slate-50" />
                </label>
                <label className="text-sm font-semibold">التخصص
                  <input maxLength={120} value={specialty} onChange={(event) => setSpecialty(event.target.value)} disabled={!canManage} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-right disabled:bg-slate-50" />
                </label>
                <label className="text-sm font-semibold">مدة الموعد (دقيقة)
                  <input required type="number" min={5} max={240} value={slotMinutes} onChange={(event) => setSlotMinutes(Number(event.target.value))} disabled={!canManage} className="mt-2 w-full rounded-xl border border-slate-200 p-3 disabled:bg-slate-50" />
                </label>
                <label className="text-sm font-semibold">السعة لكل فترة
                  <input required type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} disabled={!canManage} className="mt-2 w-full rounded-xl border border-slate-200 p-3 disabled:bg-slate-50" />
                </label>
              </div>
              {selectedId && <div className="space-y-3">
                <h3 className="font-bold">أوقات العمل الأسبوعية</h3>
                <p className="text-xs text-slate-500">الأوقات بتوقيت العيادة، وتُنشأ الفترات حسب مدة الموعد المحددة.</p>
                {weekdays.map((day, index) => {
                  const schedule = schedules.find((item) => item.weekday === index);
                  return <div key={day} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 text-sm">
                    <span className="w-20">{day}</span>
                    <input aria-label={`بداية ${day}`} type="time" disabled={!schedule || !canManage} value={schedule?.start_time || "09:00"} onChange={(event) => updateSchedule(index, "start_time", event.target.value)} className="rounded-lg border p-2 disabled:opacity-40" />
                    <input aria-label={`نهاية ${day}`} type="time" disabled={!schedule || !canManage} value={schedule?.end_time || "17:00"} onChange={(event) => updateSchedule(index, "end_time", event.target.value)} className="rounded-lg border p-2 disabled:opacity-40" />
                    <button
                      type="button"
                      disabled={!canManage}
                      aria-label={schedule ? `حذف ${day}` : `إضافة ${day}`}
                      onClick={() => setSchedules((current) => schedule
                        ? current.filter((item) => item.weekday !== index)
                        : [...current, { weekday: index, start_time: "09:00", end_time: "17:00" }].sort((a, b) => a.weekday - b.weekday))}
                      className="rounded-lg p-2 text-sky-700 disabled:opacity-40"
                    >
                      {schedule ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>;
                })}
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={!canManage} className="h-4 w-4 accent-sky-600" />
                  الطبيب نشط ويستقبل الحجوزات
                </label>
              </div>}
              {canManage && <button disabled={saving} className="btn-primary disabled:opacity-50"><Save className="ml-2 h-4 w-4" />{saving ? "جارٍ الحفظ..." : selectedId ? "حفظ بيانات الطبيب والجدول" : "إضافة الطبيب"}</button>}
            </form>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
