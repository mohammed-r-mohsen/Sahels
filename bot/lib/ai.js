// bot/lib/ai.js
// ============================================
// مساعد الحجز الذكي - Ollama محلي (بدون أي نقل بيانات خارج المملكة)
// ============================================
const axios = require('axios');
const crypto = require('crypto');
const IORedis = require('ioredis');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://host.docker.internal:11434').replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || '0.2');
const TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '60000', 10);
const MAX_TOKENS = 600;
const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY = 12;            // عدد زوجي: (سؤال + رد) × 6
const HISTORY_TTL_SEC = 60 * 60;   // ساعة
const TZ = 'Asia/Riyadh';

// ============================================
// التاريخ الحالي بتوقيت الرياض
// ============================================
function todayInfo() {
  const now = new Date();
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  const weekday = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { timeZone: TZ, weekday: 'long' }).format(now);
  return { iso, weekday };
}

// ============================================
// System Prompt - هوية المساعد (ديناميكي)
// ============================================
function buildSystemPrompt() {
  const { iso, weekday } = todayInfo();
  return `أنت "ساهل" - مساعد ذكاء اصطناعي لعيادة طبية.

هويتك:
- أنت مساعد ذكي يعمل بالذكاء الاصطناعي، ولست طبيباً ولا تقدم استشارات طبية.
- مهمتك: مساعدة المرضى في الحجز، والإجابة على الأسئلة العامة، وإدارة المواعيد.

التاريخ الحالي: ${weekday} الموافق ${iso} (توقيت الرياض).
حوّل التعابير النسبية ("بكرة"، "الأحد القادم") إلى تاريخ بصيغة YYYY-MM-DD اعتماداً على هذا التاريخ.

قواعد صارمة:
1. لا تقدم أي نصيحة طبية أو تشخيص أو وصفات دواء.
2. إذا سألك المريض عن أعراض أو أدوية، اعتذر بلطف واقترح حجز موعد.
3. إذا ذكر حالة طارئة (نزيف، ألم شديد، إغماء، اختناق)، اطلب منه الاتصال بـ 997 فوراً.
4. لا تشارك معلومات أي مريض آخر.
5. لا تخترع ساعات عمل أو أسعاراً أو خدمات لا تعرفها؛ قل إنك لا تملك المعلومة واعرض التحويل لموظف.
6. لا تستدعِ book_appointment إلا بعد أن تتأكد من الاسم والتاريخ والوقت والخدمة من المريض نفسه، ولا تحجز في تاريخ ماضٍ.
7. cancel_appointment يلغي كل مواعيد المريض القادمة؛ لا تستدعِها إلا بعد تأكيد صريح منه.
8. تحدث بالعربية البسيطة، أو بلهجة المريض إن تحدث بلهجة.

قدراتك (عبر الأدوات): book_appointment، cancel_appointment، get_my_appointments، escalate_to_human.
إذا احتاج المريض تدخلاً بشرياً أو لم تفهم طلبه مرتين، استدعِ escalate_to_human.

سلوكك: ودود ومحترف ومختصر، ولا تكرر نفسك.`;
}

// ============================================
// الأدوات
// ============================================
const EMPTY_PARAMS = { type: 'object', properties: {} };

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'احجز موعداً جديداً للمريض بعد جمع كل البيانات المطلوبة وتأكيدها',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض الكامل' },
          date: { type: 'string', description: 'التاريخ بصيغة YYYY-MM-DD' },
          time: { type: 'string', description: 'الوقت بصيغة HH:MM بنظام 24 ساعة' },
          service: { type: 'string', description: 'نوع الخدمة (كشف، استشارة، متابعة)' }
        },
        required: ['patient_name', 'date', 'time', 'service']
      }
    }
  },
  {
    type: 'function',
    function: { name: 'cancel_appointment', description: 'إلغاء كل المواعيد القادمة للمريض (بعد تأكيده)', parameters: EMPTY_PARAMS }
  },
  {
    type: 'function',
    function: { name: 'get_my_appointments', description: 'عرض كل مواعيد المريض القادمة', parameters: EMPTY_PARAMS }
  },
  {
    type: 'function',
    function: { name: 'escalate_to_human', description: 'تحويل المريض لموظف بشري عند الحاجة', parameters: EMPTY_PARAMS }
  }
];

// ============================================
// التحقق من مدخلات الأدوات (لا نثق بمخرجات النموذج)
// ============================================
function validateArgs(name, args) {
  if (name !== 'book_appointment') return null;
  const { iso } = todayInfo();

  const patientName = String(args.patient_name || '').trim();
  if (patientName.length < 2 || patientName.length > 100) return 'اسم المريض غير صالح';
  if (/[<>"'`]/.test(patientName)) return 'اسم المريض يحتوي رموزاً غير مسموحة';

  const date = String(args.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return 'صيغة التاريخ يجب أن تكون YYYY-MM-DD';
  if (date < iso) return 'لا يمكن الحجز في تاريخ ماضٍ';

  const time = String(args.time || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'صيغة الوقت يجب أن تكون HH:MM';

  const service = String(args.service || '').trim();
  if (service.length < 2 || service.length > 60) return 'الخدمة غير صالحة';

  args.patient_name = patientName;
  args.service = service;
  return null;
}

// ============================================
// سجل المحادثة: Redis مع TTL، أو ذاكرة مع كنس دوري
// يُحفظ فقط (سؤال المريض + الرد النهائي) لتفادي تسلسلات الأدوات غير الصالحة
// ============================================
let redis = null;
if (process.env.REDIS_URL) {
  redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
  redis.on('error', e => console.error('[AI REDIS]', e.message));
}

const mem = new Map();
setInterval(() => {
  const cutoff = Date.now() - HISTORY_TTL_SEC * 1000;
  for (const [k, v] of mem) if (v.t < cutoff) mem.delete(k);
}, 10 * 60 * 1000).unref();

// تجزئة الرقم حتى لا يظهر في مفاتيح Redis
const histKey = (clinicId, from) =>
  `ai:hist:${clinicId}:${crypto.createHash('sha256').update(String(from)).digest('hex').slice(0, 32)}`;

async function loadHistory(clinicId, from) {
  const key = histKey(clinicId, from);
  try {
    if (redis) {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) { console.error('[AI HIST LOAD]', e.message); return []; }
  const e = mem.get(key);
  return e && Date.now() - e.t < HISTORY_TTL_SEC * 1000 ? e.messages : [];
}

async function saveHistory(clinicId, from, messages) {
  const key = histKey(clinicId, from);
  let trimmed = messages.slice(-MAX_HISTORY);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  try {
    if (redis) {
      await redis.set(key, JSON.stringify(trimmed), 'EX', HISTORY_TTL_SEC);
      return;
    }
  } catch (e) { console.error('[AI HIST SAVE]', e.message); }
  mem.set(key, { messages: trimmed, t: Date.now() });
}

async function clearHistory(clinicId, from) {
  const key = histKey(clinicId, from);
  mem.delete(key);
  try { if (redis) await redis.del(key); } catch (e) { console.error('[AI HIST CLEAR]', e.message); }
}

// ============================================
// استدعاء النموذج (واجهة Ollama المتوافقة مع OpenAI)
// ============================================
async function callModel(messages, tools) {
  const body = {
    model: MODEL,
    messages,
    stream: false,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS
  };
  if (tools) body.tools = tools;
  const { data } = await axios.post(`${OLLAMA_URL}/v1/chat/completions`, body, { timeout: TIMEOUT_MS });
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error('ai_empty_response');
  return msg;
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return null; }
}

// ============================================
// المحادثة الرئيسية
// ============================================
async function chatWithAI({ clinicId, from, userMessage, tools = TOOLS, onToolCall }) {
  const history = await loadHistory(clinicId, from);
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage }
  ];

  const toolResults = [];
  let finalText = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // في الجولة الأخيرة نمنع الأدوات لإجبار النموذج على رد نصي
    const msg = await callModel(messages, round < MAX_TOOL_ROUNDS ? tools : undefined);
    const calls = msg.tool_calls || [];

    if (calls.length === 0) {
      finalText = (msg.content || '').trim();
      break;
    }

    // الرسالة الكاملة مع tool_calls قبل رسائل tool المقابلة لها
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const callId = call.id || `call_${round}_${i}`;
      const fnName = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      console.log(`[AI TOOL] ${fnName}`); // بدون args لتفادي تسريب بيانات المريض

      let result;
      if (args === null) {
        result = { error: 'invalid_arguments_json' };
      } else {
        const invalid = validateArgs(fnName, args);
        if (invalid) {
          result = { success: false, error: invalid };
        } else {
          try { result = await onToolCall(fnName, args); }
          catch (e) { result = { error: 'tool_failed' }; console.error('[AI TOOL ERR]', fnName, e.message); }
        }
      }

      messages.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify(result) });
      toolResults.push({ name: fnName, success: result?.success !== false && !result?.error });
    }
  }

  if (!finalText) finalText = 'عذراً، لم أتمكن من إكمال طلبك. اكتب "موظف" للتحويل لموظف بشري.';

  // نحفظ فقط الزوج النهائي (سؤال + رد)
  await saveHistory(clinicId, from, [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: finalText }
  ]);

  return { text: finalText, toolResults };
}

module.exports = { chatWithAI, TOOLS, clearHistory, validateArgs };