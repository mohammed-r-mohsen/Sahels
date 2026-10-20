"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  WandSparkles,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", href: "/dashboard", icon: LayoutDashboard },
  { label: "المواعيد", href: "/appointments", icon: CalendarDays },
  { label: "الأطباء", href: "/doctors", icon: Stethoscope },
  { label: "المرضى", href: "/patients", icon: Users },
  { label: "قائمة الانتظار", href: "/waiting-list", icon: Bell },
  { label: "التقارير", href: "/reports", icon: Grid2x2 },
  { label: "الإعدادات", href: "/settings", icon: Settings },
  { label: "التكاملات", href: "/integrations", icon: MessageSquareText },
  { label: "الفواتير", href: "/billing", icon: CreditCard },
  { label: "AI Assistant", href: "/ai-assistant", icon: WandSparkles },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-[1600px] gap-6 p-4 lg:p-6">
        <aside className="hidden w-[280px] shrink-0 rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-soft lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-lg font-black text-white">S</div>
            <div>
              <div className="text-xl font-black">Sahl</div>
              <div className="text-[10px] tracking-[0.2em] text-slate-400">CLINIC OS</div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-800 bg-white/5 p-3">
            <div className="text-xs text-slate-400">العيادة الحالية</div>
            <div className="mt-2 text-lg font-black">أسنان الراشد</div>
            <div className="text-xs text-emerald-300">مستوى نمو</div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-300">
              <ShieldCheck className="h-4 w-4" />
              الحماية والخصوصية
            </div>
            <div className="text-sm text-slate-300">جميع البيانات محمية ومُشفرة وفق السياسات الداخلية للعيادة.</div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="mb-6 rounded-[2rem] border border-slate-200 bg-white px-4 py-4 shadow-soft sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-sky-100 p-2 text-sky-700 lg:hidden">
                  <Grid2x2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold tracking-[0.2em] text-sky-700">Sahl Dashboard</div>
                  <div className="text-2xl font-black text-slate-900">نظام العيادات</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="btn-secondary">AR</button>
                <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">الملف الشخصي</button>
              </div>
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
