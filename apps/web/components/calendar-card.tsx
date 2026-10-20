"use client";

import { CalendarDays } from "lucide-react";

const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function CalendarCard() {
  const slots = [
    { time: "08:00", doctor: "د. سارة الحربي", status: "confirmed" },
    { time: "10:00", doctor: "د. محمد النمر", status: "waiting" },
    { time: "12:30", doctor: "د. لولوة العتيبي", status: "reminder" },
  ];

  return (
    <div className="card p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold tracking-[0.2em] text-sky-700">التقويم</div>
          <h3 className="mt-2 text-xl font-black text-slate-900">جدول اليوم</h3>
        </div>
        <div className="chip">اليوم</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((day, index) => (
          <div key={day} className={`rounded-2xl border p-3 ${index === 2 ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="mb-2 text-xs font-bold text-slate-500">{day}</div>
            <div className="space-y-2">
              {index === 2 ? (
                <>
                  <div className="rounded-lg bg-sky-100 px-2 py-1 text-xs font-bold text-sky-700">08:30</div>
                  <div className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">10:40</div>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">-</div>
                  <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">-</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {slots.map((slot) => (
          <div key={slot.time} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sky-700">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <div className="font-bold text-slate-900">{slot.time}</div>
                <div className="text-xs text-slate-500">{slot.doctor}</div>
              </div>
            </div>
            <div className={`rounded-full px-2 py-1 text-xs font-bold ${slot.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : slot.status === "waiting" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
              {slot.status === "confirmed" ? "مؤكد" : slot.status === "waiting" ? "قائمة انتظار" : "تذكير"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
