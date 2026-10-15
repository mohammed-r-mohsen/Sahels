// bot/lib/ai.js
const Groq = require('groq-sdk');
const { pool } = require('./db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ============================================
// System Prompt - هوية المساعد
// ============================================
const SYSTEM_PROMPT = `أنت "ساهل" - مساعد ذكاء اصطناعي لعيادة طبية.

هويتك:
- أنت مساعد ذكي يعمل بالذكاء الاصطناعي
- لست طبيباً ولا تقدم استشارات طبية
- مهمتك: مساعدة المرضى في الحجز، الإجابة على الأسئلة العامة، وإدارة المواعيد

قواعد صارمة:
1. لا تقدم أي نصيحة طبية أو تشخيص أو وصفات دواء
2. إذا سألك المريض عن أعراض أو أدوية أو تشخيص، اعتذر بلطف واقترح حجز موعد
3. إذا ذكر المريض حالة طارئة (نزيف، ألم شديد، إغماء، اختناق)، اطلب منه الاتصال بـ 997 فوراً
4. لا تشارك معلومات أي مريض آخر
5. تحدث بالعربية الفصحى البسيطة، أو بمثل لهجة المريض إن تحدث بلهجة

قدراتك:
- حجز موعد (استدعِ أداة book_appointment)
- إلغاء موعد (استدعِ أداة cancel_appointment)
- عرض مواعيد المريض (استدعِ أداة get_my_appointments)
- الإجابة على أسئلة عامة عن العيادة (ساعات العمل، الموقع، الخدمات)

سلوكك:
- كن ودوداً ومحترفاً ومختصراً
- إذا لم تفهم، اسأل للتوضيح
- إذا احتاج المريض تدخلاً بشرياً، قل له "سأحوّلك لموظف"
- لا تكرر نفسك`;

// ============================================
// Tools - الأدوات التي يستدعيها AI
// ============================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'احجز موعداً جديداً للمريض بعد جمع كل البيانات المطلوبة',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض الكامل' },
          date: { type: 'string', description: 'التاريخ بصيغة YYYY-MM-DD' },
          time: { type: 'string', description: 'الوقت بصيغة HH:MM' },
          service: { type: 'string', description: 'نوع الخدمة (كشف، استشارة، متابعة)' }
        },
        required: ['patient_name', 'date', 'time', 'service']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'إلغاء موعد قادم للمريض'
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_appointments',
      description: 'عرض كل مواعيد المريض القادمة'
    }
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'تحويل المريض لموظف بشري عند الحاجة'
    }
  }
];

// ============================================
// Conversation History (Redis-style in memory for now)
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

function addToHistory(clinicId, from, role, content, toolCallId = null) {
  const key = `${clinicId}:${from}`;
  let entry = conversations.get(key);
  if (!entry || Date.now() - entry.updatedAt > HISTORY_TTL) {
    entry = { messages: [], updatedAt: Date.now() };
  }
  const msg = { role, content };
  if (toolCallId) msg.tool_call_id = toolCallId;
  entry.messages.push(msg);
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
// AI Chat
// ============================================
async function chatWithAI({ clinicId, from, userMessage, tools, onToolCall }) {
  addToHistory(clinicId, from, 'user', userMessage);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getHistory(clinicId, from)
  ];

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 800
  });

  const assistantMessage = completion.choices[0].message;
  addToHistory(clinicId, from, 'assistant', assistantMessage.content || '', assistantMessage.tool_calls ? null : undefined);

  // إذا استدعى أداة
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const results = [];
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments || '{}');
      console.log(`[AI TOOL] ${fnName}`, args);

      let result;
      try {
        result = await onToolCall(fnName, args);
      } catch (e) {
        result = { error: e.message };
      }

      addToHistory(clinicId, from, 'tool', JSON.stringify(result), toolCall.id);

      results.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify(result)
      });
    }

    // اطلب من AI الرد النهائي
    const followup = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...getHistory(clinicId, from),
        ...results
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    const finalMessage = followup.choices[0].message.content;
    addToHistory(clinicId, from, 'assistant', finalMessage);
    return { text: finalMessage, toolResults: results };
  }

  return { text: assistantMessage.content };
}

module.exports = { chatWithAI, TOOLS, clearHistory };