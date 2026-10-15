-- scripts/seed-clinic.sql
INSERT INTO clinics (id, name, moyasar_key, wa_number)
VALUES (
        'test_clinic',
        'عيادة اختبار',
        'pk_test_xxx',
        '966500000000'
    ) ON CONFLICT (id) DO NOTHING;
INSERT INTO channel_identities (clinic_id, channel, external_id, access_token)
VALUES (
        'test_clinic',
        'whatsapp',
        '123456',
        'mock_token'
    ) ON CONFLICT (channel, external_id) DO NOTHING;
INSERT INTO clinic_subscriptions (clinic_id, plan, status, ends_at)
VALUES (
        'test_clinic',
        'trial',
        'active',
        NOW() + INTERVAL '30 days'
    ) ON CONFLICT (clinic_id) DO NOTHING;
INSERT INTO clinic_features (clinic_id, feature, enabled)
VALUES ('test_clinic', 'whatsapp', TRUE),
    ('test_clinic', 'instagram', FALSE),
    ('test_clinic', 'reception', TRUE),
    ('test_clinic', 'deposit', FALSE),
    ('test_clinic', 'reminder_3h', TRUE),
    ('test_clinic', 'waiting_list', TRUE),
    ('test_clinic', 'flow_booking', FALSE),
    ('test_clinic', 'reports', TRUE) ON CONFLICT (clinic_id, feature) DO NOTHING;
INSERT INTO clinic_deposit_config (clinic_id, enabled, amount_sar)
VALUES ('test_clinic', FALSE, 50) ON CONFLICT (clinic_id) DO NOTHING;