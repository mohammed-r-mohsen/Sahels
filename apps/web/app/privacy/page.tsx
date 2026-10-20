import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-5 text-sm font-bold tracking-[0.2em] text-sky-700">الخصوصية</div>
        <h1 className="text-3xl font-black text-slate-900">سياسة الخصوصية</h1>

        <div className="mt-6 space-y-5 text-slate-600">
          <p>نلتزم بحماية البيانات الشخصية للمرضى والموظفين في Sahl، بما في ذلك المعلومات الطبية والاتصالات والحجوزات.</p>
          <p>يتم جمع البيانات بهدف إدارة المواعيد، التواصل مع المريض، التذكير، والإحصاءات التشغيلية داخل العيادة، مع الالتزام بالحد الأدنى من جمع البيانات.</p>
          <p>لا نشارك المعلومات الطبية مع أطراف خارجية إلا بموافقة صريحة أو عندما يكون ذلك ضروريًا لتقديم الخدمة، مثل خدمات الدفع أو قنوات التواصل المعتمدة.</p>
          <p>يجوز للمستخدمين طلب رؤية بياناتهم أو تعديلها أو حذفها وفق سياسة الاحتفاظ بالبيانات والمعايير التشغيلية للمشروع.</p>
        </div>

        <div className="mt-8">
          <Link href="/" className="btn-primary">العودة إلى الرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
