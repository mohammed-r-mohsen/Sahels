import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-5 text-sm font-bold tracking-[0.2em] text-sky-700">الشروط</div>
        <h1 className="text-3xl font-black text-slate-900">شروط الاستخدام</h1>

        <div className="mt-6 space-y-5 text-slate-600">
          <p>يُعد استخدامك لمنصة Sahl موافقة على الالتزام بشروط الخدمة، بما في ذلك استخدام البيانات الطبية بطريقة مسؤولة ووفق الأنظمة المعمول بها.</p>
          <p>يسمح النظام للعناية الطبية مديرية العيادة بإدارة المواعيد، التذكيرات، الاتصال، والتقارير بينما يكون للمريض الحق في مراجعة البيانات أو تعديلها عبر قنوات الخدمة.</p>
          <p>يُمنع استخدام النظام لأغراض غير قانونية أو إساءة التعامل مع بيانات المرضى أو معلوماتهم الصحية أو الرسائل الواردة من العملاء.</p>
          <p>يحق للمشغل إيقاف أو تعديل الخدمة في حال تجاوز الاستخدام للسياسات أو عدم الالتزام بالالتزامات التعاقدية.</p>
        </div>

        <div className="mt-8">
          <Link href="/" className="btn-primary">العودة إلى الرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
