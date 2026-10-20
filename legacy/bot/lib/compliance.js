const CONSENT_MSG = `بموافقتك على الحجز توافق على حفظ بياناتك (الاسم والجوال) لغرض الحجز فقط لمدة سنتين داخل السعودية حسب PDPL.\nاكتب "موافق" للمتابعة.`;
const MEDICAL_DISCLAIMER = `تنبيه: هذا البوت للحجز فقط وليس استشارة طبية. في الطوارئ توجه للطوارئ فوراً.`;

// 🔴 إزالة كلمات مثل (قلب، ضغط، تحليل) لأنها قد تكون أسماء عيادات أو خدمات
const FORBIDDEN_MEDICAL = ['تشخيص', 'سرطان', 'ورم', 'خذ دواء', 'جرعة', 'عملية جراحية', 'diagnosis', 'prescription', 'dosage'];
const EMERGENCY = ['نزيف حاد', 'ألم في الصدر', 'اغماء', 'إغماء', 'اختناق', 'حادث', 'bleeding', 'emergency', 'fainted', 'chest pain'];

const isEmergency = t => EMERGENCY.some(k => t.includes(k));
const isMedical = t => FORBIDDEN_MEDICAL.some(k => t.toLowerCase().includes(k));

module.exports = { CONSENT_MSG, MEDICAL_DISCLAIMER, isEmergency, isMedical };