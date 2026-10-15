// bot/lib/ai.js
// الإصدار المُصحّح v3.3 - إصلاحات:
// 1. تسلسل tool_calls صحيح
// 2. تمرير التاريخ والمنطقة الزمنية
// 3. تمرير بيانات العيادة (ساعات، خدمات)
// 4. parameters كاملة لكل الأدوات

const Groq = require('groq-sdk');
const { pool } = require('./db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const TZ = 'Asia/Riyadh';

// ============================================
// System Prompt Builder - يُبنى لكل طلب
// ============================================
async function buildSystemPrompt(clinicId) {
  const now = new Date();

  // حساب التاريخ بصيغة ISO بالمنطقة الزمنية السعودية
  const isoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const isoDate = `${isoParts.find(p => p.type === 'year').value}-${isoParts.find(p => p.type === 'month').value}-${isoParts.find(p => p.type === 'day').value}`;

  // التاريخ بالعربية
  const dateAr = new Intl.DateTimeFormat('ar-SA', {
    timeZone: TZ,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(now);

  // الوقت بالعربية
  const timeAr = new Intl.DateTimeFormat('ar-SA', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true
  }).format(now);

  // ===== جلب بيانات العيادة =====
  let clinicName = 'العيادة';
  let workingHours = '9:00 ص - 5:00 م';
  let services = 'كشف، استشارة، متابعة';
  let address = '';
  let phone = '';

  try {
    const r = await pool.query(
      'SELECT name, wa_number, review_link FROM clinics WHERE id=$1',
      [clinicId]
    );
    if (r.rows[0]) {
      clinicName = r.rows[0].name || clinicName;
      phone = r.rows[0].wa_number || '';
    }

    // جلب إعدادات إضافية من clinic_features إن وُجدت
    const feats = await pool.query(
      `SELECT config FROM clinic_features
       WHERE clinic_id=$1 AND feature='whatsapp'`,
      [clinicId]
    );
    const cfg = feats.rows[0]?.config || {};
    if (cfg.working_hours) workingHours = cfg.working_hours;
    if (Array.isArray(cfg.services) && cfg.services.length) {
      services = cfg.services.join('، ');
    }
    if (cfg.address) address = cfg.address;
  } catch (e) {
    console.error('[AI] clinic context load failed:', e.message);
  }

  return `أنت "ساهل" - مساعد ذكاء اصطناعي لعيادة ${clinicName}.

## ⏰ التاريخ والوقت الحالي (مهم جداً)
- اليوم: ${dateAr}
- الوقت الآن: ${timeAr} (توقيت السعودية)
- **التاريخ بصيغة ISO: ${isoDate}**

⚠️ استخدم التاريخ أعلاه دائماً لحساب التواريخ النسبية:
- "اليوم" → ${isoDate}
- "بكرة" أو "غداً" → التاريخ التالي لـ ${isoDate}
- "بعد بكرة" → بعد يومين من ${isoDate}
- "الأحد القادم" → أول أحد بعد ${isoDate}
- "هذا الأسبوع" → الأيام بين ${isoDate} ونهاية الأسبوع
- **لا تخمّن التواريخ أبداً.** احسبها دائماً من ${isoDate}.

## 🏥 بيانات العيادة
- الاسم: ${clinicName}
- ساعات العمل: ${workingHours}
- الخدمات المتوفرة: ${services}
${address ? `- العنوان: ${address}` : ''}
${phone ? `- رقم التواصل: ${phone}` : ''}

## 👤 هويتك
- أنت مساعد ذكاء اصطناعي (AI)، لست طبيباً بشرياً
- لا تقدم تشخيصاً طبياً ولا وصفات دواء
- إذا سُئلت عن أعراض، اقترح حجز موعد مع طبيب

## 🚨 قواعد صارمة
1. في الحالات الطارئة (نزيف، ألم شديد، إغماء، اختناق) → اطلب من المريض الاتصال بـ 997 فوراً
2. لا تشارك معلومات أي مريض آخر
3. تحدث بالعربية الفصحى البسيطة، أو بلهجة المريض
4. كن ودوداً ومختصراً (لا تكرر نفسك)

## 🛠️ قدراتك
- **book_appointment**: احجز موعداً. يحتاج: اسم المريض، التاريخ (YYYY-MM-DD)، الوقت (HH:MM)، الخدمة
- **cancel_appointment**: ألغِ موعداً. يحتاج: تاريخ الموعد (YYYY-MM-DD) — اسأل المريض إذا لم يحدده
- **get_my_appointments**: اعرض مواعيد المريض القادمة
- **escalate_to_human**: حوّل المريض لموظف بشري. يحتاج: سبب التحويل

## 📋 سلوكك
- إذا لم تفهم، اسأل للتوضيح
- إذا احتاج المريض تدخلاً بشرياً، استخدم escalate_to_human
- إذا أراد الحجز، اجمع البيانات الأربعة أولاً ثم استدعِ book_appointment`;
}

// ============================================
// Tools - مع parameters صحيحة لكل أداة
// ============================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'احجز موعداً جديداً. يجب جمع الاسم والتاريخ والوقت والخدمة من المريض أولاً قبل الاستدعاء.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: {
            type: 'string',
            description: 'اسم المريض الكامل كما ذكره'
          },
          date: {
            type: 'string',
            description: 'التاريخ بصيغة YYYY-MM-DD. احسبه من التاريخ الحالي المذكور في System Prompt.'
          },
          time: {
            type: 'string',
            description: 'الوقت بصيغة HH:MM (24 ساعة). مثال: 10:00 أو 14:30'
          },
          service: {
            type: 'string',
            description: 'نوع الخدمة. اختر من: كشف، استشارة، متابعة'
          }
        },
        required: ['patient_name', 'date', 'time', 'service']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'إلغاء موعد قادم. إذا كان للمريض أكثر من موعد، اسأله عن التاريخ أولاً.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'تاريخ الموعد المراد إلغاؤه بصيغة YYYY-MM-DD. إذا لم يحدده المريض، اتركه فارغاً لإلغاء أقرب موعد.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_appointments',
      description: 'اعرض كل مواعيد المريض القادمة.',
      parameters: {
        type: 'object',
        properties: {
          include_past: {
            type: 'boolean',
            description: 'إذا true، اعرض أيضاً المواعيد السابقة. الافتراضي false.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'حوّل المريض لموظف بشري عند الحاجة (شكوى، استفسار معقد، طلب صريح).',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'سبب التحويل بالعربية'
          }
        },
        required: ['reason']
      }
    }
  }
];

// ============================================
// Conversation History
// ============================================
const conversations = new Map();
const MAX_HISTORY = 20;
const HISTORY_TTL = 60 * 60 * 1000; // ساعة

function getHistory(clinicId, from) {
  const key = `${clinicId}:${from}`;
  const entry = conversations.get(key);
  if (!entry || Date.now() - entry.updatedAt > HISTORY_TTL) {
    return [];
  }
  return entry.messages;
}

function addMessage(clinicId, from, message) {
  const key = `${clinicId}:${from}`;
  let entry = conversations.get(key);
  if (!entry || Date.now() - entry.updatedAt > HISTORY_TTL) {
    entry = { messages: [], updatedAt: Date.now() };
  }
  entry.messages.push(message);
  if (entry.messages.length > MAX_HISTORY) {
    entry.messages = entry.messages.slice(-MAX_HISTORY);
  }
  entry.updatedAt = Date.now();
  conversations.set(key, entry);
}

function clearHistory(clinicId, from) {
  conversations.delete(`${clinicId}:${from}`);
}

// ============================================
// chatWithAI - FIXED
// ============================================
async function chatWithAI({ clinicId, from, userMessage, onToolCall }) {
  // 1. بناء System Prompt مع التاريخ وبيانات العيادة (مرة واحدة)
  const systemPrompt = await buildSystemPrompt(clinicId);

  // 2. أضف رسالة المريض للسجل
  addMessage(clinicId, from, { role: 'user', content: userMessage });

  // 3. الجولة الأولى - الموديل قد يستدعي أدوات
  const messages1 = [
    { role: 'system', content: systemPrompt },
    ...getHistory(clinicId, from)
  ];

  const completion1 = await groq.chat.completions.create({
    model: MODEL,
    messages: messages1,
    tools: TOOLS,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 800
  });

  const assistantMsg = completion1.choices[0].message;

  // ===== الحالة A: رد نصي عادي بدون أدوات =====
  if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
    const text = assistantMsg.content || 'عذراً، لم أفهم طلبك. حاول مرة أخرى.';
    addMessage(clinicId, from, { role: 'assistant', content: text });
    return { text, toolResults: [] };
  }

  // ===== الحالة B: الموديل استدعى أدوات =====
  // ✅ إصلاح: احفظ رسالة assistant كاملة مع tool_calls
  addMessage(clinicId, from, {
    role: 'assistant',
    content: assistantMsg.content || null,
    tool_calls: assistantMsg.tool_calls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }))
  });

  // ✅ إصلاح: نفذ الأدوات مرة واحدة فقط، وأضف نتيجة كل أداة كرسالة tool
  const toolResults = [];
  for (const toolCall of assistantMsg.tool_calls) {
    const fnName = toolCall.function.name;
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch (e) {
      console.error(`[AI TOOL] invalid args for ${fnName}:`, toolCall.function.arguments);
      args = {};
    }

    console.log(`[AI TOOL] ${fnName}`, JSON.stringify(args));

    let result;
    try {
      result = await onToolCall(fnName, args);
    } catch (e) {
      console.error(`[AI TOOL] ${fnName} failed:`, e.message);
      result = { success: false, error: e.message || 'tool execution failed' };
    }

    // ✅ إصلاح: احفظ رسالة tool في السجل مرة واحدة فقط
    addMessage(clinicId, from, {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result)
    });

    toolResults.push({ name: fnName, args, result });
  }

  // 4. الجولة الثانية - اطلب الرد النهائي (بدون tools لتجنب loop)
  const messages2 = [
    { role: 'system', content: systemPrompt },
    ...getHistory(clinicId, from)
  ];

  const completion2 = await groq.chat.completions.create({
    model: MODEL,
    messages: messages2,
    // ⚠️ لا تمرر tools هنا - لتجنب استدعاءات متكررة لا نهائية
    temperature: 0.7,
    max_tokens: 800
  });

  const finalMsg = completion2.choices[0].message;
  const finalText = finalMsg.content || 'تم تنفيذ طلبك.';

  addMessage(clinicId, from, { role: 'assistant', content: finalText });

  return { text: finalText, toolResults };
}

module.exports = { chatWithAI, TOOLS, clearHistory, buildSystemPrompt };