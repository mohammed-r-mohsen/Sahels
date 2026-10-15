const { pool } = require('./db');
const { isMulti, getStaticClinicId } = require('./tenancy');

const cache = new Map();
const CACHE_TTL = 60 * 1000;

async function resolveClinicId({ channel, externalId, hostname, headerClinicId }) {
    if (!isMulti()) return getStaticClinicId();

    if (headerClinicId) {
        const key = `h:${headerClinicId}`;
        const c = cache.get(key);
        if (c && Date.now() - c.t < CACHE_TTL) return c.id;
        const r = await pool.query('SELECT id FROM clinics WHERE id=$1', [headerClinicId]);
        if (r.rows[0]) { cache.set(key, { id: r.rows[0].id, t: Date.now() }); return r.rows[0].id; }
        return null;
    }

    if (hostname) {
        const sub = hostname.split('.')[0];
        if (sub && !['www', 'app', 'api', 'central'].includes(sub)) {
            const key = `s:${sub}`;
            const cached = cache.get(key);
            if (cached && Date.now() - cached.t < CACHE_TTL) return cached.id;
            const r = await pool.query('SELECT id FROM clinics WHERE id=$1', [sub]);
            if (r.rows[0]) { cache.set(key, { id: r.rows[0].id, t: Date.now() }); return r.rows[0].id; }
        }
    }

    if (channel && externalId) {
        const key = `c:${channel}:${externalId}`;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.t < CACHE_TTL) return cached.id;
        const r = await pool.query(
            'SELECT clinic_id FROM channel_identities WHERE channel=$1 AND external_id=$2',
            [channel, externalId]
        );
        if (r.rows[0]) { cache.set(key, { id: r.rows[0].clinic_id, t: Date.now() }); return r.rows[0].clinic_id; }
    }

    return null;
}

async function getClinicCredentials(clinicId) {
    const r = await pool.query(
        `SELECT c.id, c.name, c.moyasar_key, c.wa_number, c.review_link,
            (SELECT external_id FROM channel_identities WHERE clinic_id=c.id AND channel='whatsapp' LIMIT 1) AS wa_phone_id,
            (SELECT access_token FROM channel_identities WHERE clinic_id=c.id AND channel='whatsapp' LIMIT 1) AS wa_token
     FROM clinics c WHERE c.id=$1`,
        [clinicId]
    );
    return r.rows[0] || null;
}

module.exports = { resolveClinicId, getClinicCredentials };