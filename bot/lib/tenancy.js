const TENANCY_MODE = process.env.TENANCY_MODE || 'single';

if (!['single', 'multi'].includes(TENANCY_MODE)) {
    console.error(`[TENANCY] Invalid mode: ${TENANCY_MODE}. Use 'single' or 'multi'.`);
    process.exit(1);
}

const SINGLE_CLINIC_ID = process.env.CLINIC_ID;

if (TENANCY_MODE === 'single' && !SINGLE_CLINIC_ID) {
    console.error('[TENANCY] CLINIC_ID required in single mode.');
    process.exit(1);
}

module.exports = {
    TENANCY_MODE,
    isMulti: () => TENANCY_MODE === 'multi',
    isSingle: () => TENANCY_MODE === 'single',
    getStaticClinicId: () => SINGLE_CLINIC_ID
};