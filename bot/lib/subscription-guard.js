const { getClinicContext } = require('./features');

const CHANNEL_FEATURE_MAP = {
    whatsapp: 'whatsapp',
    instagram: 'instagram',
    reception: 'reception',
    flow: 'flow_booking',
    deposit: 'deposit'
};

async function checkAccess(clinicId, channel) {
    const ctx = await getClinicContext(clinicId);

    if (!ctx.subscription.active) {
        return {
            allowed: false,
            reason: 'subscription_inactive',
            message: '⚠️ عذراً، خدمة الحجز غير متاحة مؤقتاً. للاستفسار تواصل مع الإدارة.',
            context: ctx
        };
    }

    const feature = CHANNEL_FEATURE_MAP[channel];
    if (feature && ctx.features[feature] === false) {
        return {
            allowed: false,
            reason: 'feature_disabled',
            message: '⚠️ هذه الخدمة غير مفعّلة حالياً لهذه العيادة.',
            context: ctx
        };
    }

    return { allowed: true, context: ctx };
}

function requireActiveSubscription(featureName) {
    return async (req, res, next) => {
        const clinicId = req.clinicId || req.headers['x-clinic-id'] || process.env.CLINIC_ID;
        if (!clinicId) return res.status(400).json({ error: 'clinic_id required' });

        const ctx = await getClinicContext(clinicId);

        if (!ctx.subscription.active) {
            return res.status(402).json({
                error: 'subscription_inactive',
                message: 'اشتراك العيادة غير فعّال',
                ends_at: ctx.subscription.ends_at
            });
        }

        if (featureName && ctx.features[featureName] === false) {
            return res.status(403).json({ error: 'feature_disabled', feature: featureName });
        }

        req.clinicContext = ctx;
        next();
    };
}

module.exports = { checkAccess, requireActiveSubscription };