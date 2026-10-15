// bot/lib/sensitive.js

// ============================================
// كشف المحتوى الحساس
// ============================================

const EMERGENCY_KEYWORDS = [
  'نزيف', 'الم شديد', 'ألم شديد', 'صداع شديد', 'اغماء', 'إغماء',
  'اختناق', 'طارئ', 'طوارئ', 'ولادة', 'حادث', 'سقوط', 'كسر',
  'جلطة', 'ذبحة', 'قلب', 'تنفس', 'صرع', 'تشنج', 'غيبوبة',
  'bleeding', 'emergency', 'fainted', 'stroke', 'heart attack',
  'severe pain', 'unconscious', 'seizure'
];

const MEDICAL_ADVICE_KEYWORDS = [
  'بنادول', 'بندول', 'باراسيتامول', 'ايبوبروفين', 'مضاد حيوي',
  'دواء', 'علاج', 'وصفة', 'جرعة', 'حبوب', 'كبسولات',
  'تشخيص', 'مرض', 'سرطان', 'ورم', 'التهاب', 'سكري', 'ضغط',
  'تحليل', 'أشعة', 'فحص دم', 'مزرعة',
  'diagnosis', 'prescription', 'medication', 'antibiotic',
  'dose', 'treatment', 'symptoms'
];

const ABUSE_KEYWORDS = [
  'غبي', 'حمار', 'كلب', 'قذر', 'زبالة', 'خرا', 'ينعل',
  'fuck', 'shit', 'stupid', 'idiot'
];

const PERSONAL_INFO_REQUEST = [
  'رقم بطاقة', 'هوية', 'جواز', 'كلمة مرور', 'باسورد', 'OTP',
  'رمز التحقق', 'الحساب البنكي', 'بطاقة ائتمان'
];

function detectSensitivity(text) {
  const lower = text.toLowerCase().trim();
  const original = text.trim();

  // 1. طارئ
  for (const kw of EMERGENCY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        type: 'emergency',
        severity: 'critical',
        matched: kw,
        response: `🚨 إذا كانت لديك حالة طارئة، اتصل بـ 997 فوراً أو اذهب لأقرب مستشفى.\n\nلا تنتظر ردنا. صحتك أهم من أي شيء.`
      };
    }
  }

  // 2. طلب نصيحة طبية
  for (const kw of MEDICAL_ADVICE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        type: 'medical_advice',
        severity: 'high',
        matched: kw,
        response: `أنا مساعد ذكاء اصطناعي ولا أستطيع تقديم نصائح طبية أو تشخيص أو وصفات دواء.\n\nللحصول على استشارة طبية، احجز موعداً مع طبيب مختص.\n\nهل أساعدك في الحجز؟`
      };
    }
  }

  // 3. إساءة
  for (const kw of ABUSE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        type: 'abuse',
        severity: 'medium',
        matched: kw,
        response: `أنا هنا لمساعدتك باحترام. من فضلك تحدث بأسلوب مهني.\n\nكيف أساعدك اليوم؟`
      };
    }
  }

  // 4. طلب معلومات شخصية حساسة
  for (const kw of PERSONAL_INFO_REQUEST) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        type: 'personal_info',
        severity: 'high',
        matched: kw,
        response: `⚠️ لا نطلب أبداً معلوماتك الشخصية الحساسة (بطاقة، جواز، OTP، حسابات بنكية) عبر واتساب.\n\nإذا وصلك طلب كهذا، فهو احتيال. تجاهله.`
      };
    }
  }

  return { type: 'safe', severity: 'none' };
}

module.exports = { detectSensitivity };