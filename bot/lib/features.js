const { pool } = require('./db');
const { isSingle } = require('./tenancy');

const cache = new Map();
const CACHE_TTL = 30 * 1000;

async function getClinicContext(clinicId) {
    if (isSingle()) {
        return {
            subscription: { active: process.env.SUBSCRIPTION_ACTIVE !== 'false', plan: 'single' },
            features: {
                whatsapp: process.env.FEATURE_WHATSAPP !== 'false',
                instagram: process.env.FEATURE_INSTAGRAM !== 'false',
                reception: process.env.FEATURE_RECEPTION !== 'false',
                deposit: process.env.FEATURE_DEPOSIT === 'true',
                reminder_3h: process.env.FEATURE_REMINDER !== 'false',
                waiting_list: process.env.FEATURE_WAITING_LIST !== 'false',
                flow_booking: process.env.FEATURE_FLOW === 'true',
                reports: process.env.FEATURE_REPORTS !== 'false'
            },
            deposit: {
                enabled: process.env.FEATURE_DEPOSIT === 'true',
                amount_sar: parseFloat(process.env.DEPOSIT_AMOUNT || '50'),
                moyasar_key: process.env.MOYASAR_KEY,
                required_for: (process.env.DEPOSIT_REQUIRED_FOR || 'whatsapp').split(',')
            },
            wa_phone_id: process.env.WA_PHONE_NUMBER_ID,
            wa_token: process.env.WA_TOKEN,
            ig_id: process.env.INSTAGRAM_ID,
            ig_token: process.env.INSTAGRAM_TOKEN
        };
    }

    const key = `ctx:${clinicId}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.t < CACHE_TTL) return cached.v;

    const [subRes, featRes, depRes, chRes] = await Promise.all([
        pool.query('SELECT * FROM clinic_subscriptions WHERE clinic_id=$1', [clinicId]),
        pool.query('SELECT feature, enabled FROM clinic_features WHERE clinic_id=$1', [clinicId]),
        pool.query('SELECT * FROM clinic_deposit_config WHERE clinic_id=$1', [clinicId]),
        pool.query("SELECT channel, external_id, access_token FROM channel_identities WHERE clinic_id=$1", [clinicId])
    ]);

    const sub = subRes.rows[0];
    const features = {};
    for (const f of featRes.rows) features[f.feature] = f.enabled;

    const ch = {};
    for (const c of chRes.rows) ch[c.channel] = { external_id: c.external_id, token: c.access_token };

    const ctx = {
        subscription: {
            active: sub ? (sub.status === 'active' && new Date(sub.ends_at) > new Date()) : false,
            plan: sub?.plan || 'none',
            status: sub?.status || 'none',
            ends_at: sub?.ends_at,
            days_left: sub ? Math.max(0, Math.ceil((new Date(sub.ends_at) - Date.now()) / 86400000)) : 0
        },
        features: {
            whatsapp: features.whatsapp !== false,
            instagram: features.instagram !== false,
            reception: features.reception !== false,
            deposit: features.deposit === true,
            reminder_3h: features.reminder_3h !== false,
            waiting_list: features.waiting_list !== false,
            flow_booking: features.flow_booking === true,
            instagram_refresh: features.instagram_refresh !== false,
            review_request: features.review_request === true,
            reports: features.reports !== false
        },
        deposit: depRes.rows[0] ? {
            enabled: depRes.rows[0].enabled,
            amount_sar: parseFloat(depRes.rows[0].amount_sar),
            moyasar_key: depRes.rows[0].moyasar_key,
            required_for: depRes.rows[0].required_for || [],
            refundable: depRes.rows[0].refundable,
            refund_window_h: depRes.rows[0].refund_window_h
        } : { enabled: false },
        wa_phone_id: ch.whatsapp?.external_id,
        wa_token: ch.whatsapp?.token,
        ig_id: ch.instagram?.external_id,
        ig_token: ch.instagram?.token
    };

    cache.set(key, { v: ctx, t: Date.now() });
    return ctx;
}

function invalidateCache(clinicId) {
    if (clinicId) cache.delete(`ctx:${clinicId}`);
    else cache.clear();
}

module.exports = { getClinicContext, invalidateCache };