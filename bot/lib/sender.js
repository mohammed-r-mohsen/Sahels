const axios = require('axios');
const { getWhatsappQueue, getIgQueue } = require('./queue');

async function sendWhatsApp({ phoneId, token, to, text, template }) {
    const payload = template
        ? { messaging_product: 'whatsapp', to, type: 'template', template }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };

    if (process.env.MOCK_WHATSAPP === 'true') {
        try {
            await axios.post('http://host.docker.internal:9999/messages', {
                to, type: payload.type, text: payload.text, template: payload.template
            }, { timeout: 3000 });
            console.log(`[WA MOCK] → ${to}: ${text || template?.name}`);
        } catch (e) { console.error('[WA MOCK]', e.message); }
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
        console.log(`[WA MOCK-NO-TOKEN] to=${to} body=${text}`);
        return;
    }
    try {
        await axios.post(
            `https://graph.facebook.com/v20.0/${phoneId}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
    } catch (e) { console.error('[WA SEND]', e.response?.data || e.message); }
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
        console.log(`[IG MOCK-NO-TOKEN] to=${to} body=${text}`);
        return;
    }
    try {
        await axios.post(
            `https://graph.facebook.com/v20.0/${igUserId}/messages?access_token=${token}`,
            payload,
            { timeout: 15000 }
        );
    } catch (e) { console.error('[IG SEND]', e.response?.data || e.message); }
}

module.exports = { sendWhatsApp, sendInstagram };