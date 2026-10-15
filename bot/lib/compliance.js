// يرجى العلم ان الملف هذا يجب ان يخضع الى بحث البايثون للتعلم بخصوص الكلمات الحساسةو او المعلومات الحساسة حول المرضى 

const CONSENT_MSG = `بموافقتك على الحجز توافق على حفظ بياناتك (الاسم والجوال) لغرض الحجز فقط لمدة سنتين داخل السعودية حسب PDPL. بياناتك محفوظة في الرياض.\nاكتب "موافق" للمتابعة.`;
const MEDICAL_DISCLAIMER = `تنبيه: هذا البوت للحجز فقط وليس استشارة طبية. في الطوارئ توجه للطوارئ فوراً.`;

const FORBIDDEN_MEDICAL = ['بنادول', 'مضاد', 'تشخيص', 'سرطان', 'ورم', 'خذ دواء', 'جرعة', 'عملية', 'diagnosis', 'prescription'];
const EMERGENCY = ['نزيف', 'الم شديد', 'ألم شديد', 'اغماء', 'إغماء', 'اختناق', 'طارئ', 'ولادة', 'حادث', 'bleeding', 'emergency', 'fainted'];

const isEmergency = t => EMERGENCY.some(k => t.includes(k));
const isMedical = t => FORBIDDEN_MEDICAL.some(k => t.toLowerCase().includes(k));

module.exports = { CONSENT_MSG, MEDICAL_DISCLAIMER, isEmergency, isMedical };