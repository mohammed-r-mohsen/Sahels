"use client";

import { ArrowUpRight } from "lucide-react";

type Tone = "sky" | "emerald" | "amber" | "violet";

export function StatsCard({ title, value, change, icon: Icon, tone }: { title: string; value: string; change: string; icon: React.ComponentType<{ className?: string }>; tone: Tone }) {
  const tones = {
    sky: "bg-sky-100 text-sky-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600">
        <ArrowUpRight className="h-4 w-4" />
        {change}
      </div>
    </div>
  );
}
