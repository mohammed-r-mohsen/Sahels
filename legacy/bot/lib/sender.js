// bot/lib/sender.js
// v3.5 - بدون mock server خارجي

const axios = require('axios');
const { getWhatsappQueue, getIgQueue } = require('./queue');

async function sendWhatsApp({ phoneId, token, to, text, template }) {
  const payload = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };

  // MOCK: طباعة فقط
  if (process.env.MOCK_WHATSAPP === 'true') {
    console.log(`[WA MOCK] → ${to}: ${text || template?.name}`);
    return;
  }

  const queue = getWhatsappQueue();
  if (queue) {
    await queue.add(
      `wa-${to}-${Date.now()}`,
      { phone_id: phoneId, token, payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true }
    );
    return;
  }

  if (!token || !phoneId) {
    console.log(`[WA NO-TOKEN] to=${to} body=${text}`);
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
  } catch (e) {
    console.error('[WA SEND]', e.response?.data || e.message);
  }
}

async function sendInstagram({ igUserId, token, to, text }) {
  const payload = { recipient: { id: to }, message: { text } };

  if (process.env.MOCK_WHATSAPP === 'true') {
    console.log(`[IG MOCK] → ${to}: ${text}`);
    return;
  }

  const queue = getIgQueue();
  if (queue) {
    await queue.add(
      `ig-${to}-${Date.now()}`,
      { ig_user_id: igUserId, token, payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true }
    );
    return;
  }

  if (!token || !igUserId) {
    console.log(`[IG NO-TOKEN] to=${to} body=${text}`);
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${igUserId}/messages?access_token=${token}`,
      payload,
      { timeout: 15000 }
    );
  } catch (e) {
    console.error('[IG SEND]', e.response?.data || e.message);
  }
}

module.exports = { sendWhatsApp, sendInstagram };