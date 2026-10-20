type Column<T extends Record<string, any>> = {
  key: keyof T;
  header: string;
};

export function DataTable<T extends Record<string, any>>({ title, rows, columns }: { title: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className="px-5 py-4 font-semibold">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50">
                {columns.map((column) => {
                  const value = row[column.key];
                  const text = String(value ?? "");
                  if (text.startsWith("مؤكد") || text.startsWith("نشط") || text.startsWith("حضور") || text.startsWith("مكتمل") || text.startsWith("منجزة") || text.startsWith("مفتوحة") || text.startsWith("جديد")) {
                    return <td key={String(column.key)} className="px-5 py-4"><span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">{value}</span></td>;
                  }
                  if (text.startsWith("قائمة انتظار") || text.startsWith("منتظر") || text.startsWith("تأخير") || text.startsWith("انتظار")) {
                    return <td key={String(column.key)} className="px-5 py-4"><span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">{value}</span></td>;
                  }
                  if (text.startsWith("ملغي") || text.startsWith("غير موجود") || text.startsWith("مرفوض")) {
                    return <td key={String(column.key)} className="px-5 py-4"><span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">{value}</span></td>;
                  }
                  return <td key={String(column.key)} className="px-5 py-4">{value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
