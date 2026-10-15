-- ============================================
-- Sahels v3.2 - Database Schema
-- PostgreSQL 15+ | Timezone: Asia/Riyadh
-- ============================================
SET timezone = 'Asia/Riyadh';
-- 1. العيادات
CREATE TABLE IF NOT EXISTS clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip TEXT,
    moyasar_key TEXT,
    review_link TEXT,
    wa_number TEXT,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. قنوات الاتصال
CREATE TABLE IF NOT EXISTS channel_identities (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram')),
    external_id TEXT NOT NULL,
    access_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_clinic ON channel_identities(clinic_id);
-- 3. موافقات المرضى (PDPL)
CREATE TABLE IF NOT EXISTS consents (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT NOT NULL,
    patient_ref TEXT NOT NULL,
    consent_text TEXT,
    consent_version TEXT DEFAULT 'v1',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 years'),
    UNIQUE(clinic_id, patient_ref)
);
-- 4. الحجوزات
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    patient_name TEXT,
    date DATE NOT NULL,
    time TIME NOT NULL,
    service TEXT,
    source TEXT NOT NULL DEFAULT 'whatsapp',
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
        status IN (
            'pending',
            'confirmed',
            'cancelled',
            'completed',
            'no_show'
        )
    ),
    consent_given BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    deposit_payment_id TEXT,
    deposit_paid BOOLEAN DEFAULT FALSE,
    risk_score NUMERIC(3, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_booking_slot ON bookings (clinic_id, date, time)
WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_bookings_clinic_date ON bookings (clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_patient ON bookings (clinic_id, patient_phone);
-- 5. قائمة الانتظار
CREATE TABLE IF NOT EXISTS waiting_list (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    patient_name TEXT,
    desired_date DATE,
    service TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waiting_clinic ON waiting_list(clinic_id, created_at);
-- 6. سجل الوصول
CREATE TABLE IF NOT EXISTS access_logs (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logs_clinic ON access_logs (clinic_id, created_at DESC);
-- 7. العيادات المركزية
CREATE TABLE IF NOT EXISTS central_clinics (
    clinic_id TEXT PRIMARY KEY,
    name TEXT,
    ip TEXT,
    api_key_hash TEXT NOT NULL,
    wa_phone_id TEXT,
    instagram_id TEXT,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ,
    bookings_today INT DEFAULT 0,
    bookings_total INT DEFAULT 0,
    whatsapp INT DEFAULT 0,
    instagram INT DEFAULT 0,
    version TEXT,
    server_stats JSONB
);
-- 8. الاشتراكات
CREATE TABLE IF NOT EXISTS clinic_subscriptions (
    clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'suspended', 'expired', 'cancelled')
    ),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    trial_ends_at TIMESTAMPTZ,
    amount_sar NUMERIC(10, 2) DEFAULT 0,
    paid_at TIMESTAMPTZ,
    payment_ref TEXT,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subs_status ON clinic_subscriptions(status, ends_at);
-- 9. الميزات (Feature Flags)
CREATE TABLE IF NOT EXISTS clinic_features (
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    feature TEXT NOT NULL CHECK (
        feature IN (
            'whatsapp',
            'instagram',
            'reception',
            'deposit',
            'reminder_3h',
            'waiting_list',
            'flow_booking',
            'instagram_refresh',
            'review_request',
            'reports'
        )
    ),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (clinic_id, feature)
);
-- 10. إعدادات العربون
CREATE TABLE IF NOT EXISTS clinic_deposit_config (
    clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    amount_sar NUMERIC(10, 2) NOT NULL DEFAULT 50,
    moyasar_key TEXT,
    required_for TEXT [] DEFAULT ARRAY ['whatsapp']::TEXT [],
    refundable BOOLEAN DEFAULT TRUE,
    refund_window_h INT DEFAULT 24,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 11. المدفوعات
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    clinic_id TEXT NOT NULL,
    booking_id INT,
    moyasar_id TEXT,
    amount_sar NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'SAR',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_url TEXT,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_clinic ON payments(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
-- 12. اشتراكات التقارير
CREATE TABLE IF NOT EXISTS report_subscriptions (
    id SERIAL PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'webhook')),
    destination TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    report_type TEXT NOT NULL CHECK (report_type IN ('summary', 'per_clinic', 'full')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 13. سجل التقارير
CREATE TABLE IF NOT EXISTS report_history (
    id SERIAL PRIMARY KEY,
    report_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_bookings INT DEFAULT 0,
    total_cancelled INT DEFAULT 0,
    total_clinics INT DEFAULT 0,
    payload JSONB,
    sent_to TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 14. ميزات المريض (للتنبؤ)
CREATE TABLE IF NOT EXISTS patient_features (
    clinic_id TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    total_bookings INT DEFAULT 0,
    total_cancelled INT DEFAULT 0,
    total_no_show INT DEFAULT 0,
    last_booking_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (clinic_id, patient_phone)
);
-- Helper Functions
CREATE OR REPLACE FUNCTION is_subscription_active(p_clinic_id TEXT) RETURNS BOOLEAN AS $$
SELECT EXISTS (
        SELECT 1
        FROM clinic_subscriptions
        WHERE clinic_id = p_clinic_id
            AND status = 'active'
            AND ends_at > NOW()
    );
$$ LANGUAGE SQL STABLE;
CREATE OR REPLACE FUNCTION is_feature_enabled(p_clinic_id TEXT, p_feature TEXT) RETURNS BOOLEAN AS $$
SELECT COALESCE(
        (
            SELECT enabled
            FROM clinic_features
            WHERE clinic_id = p_clinic_id
                AND feature = p_feature
        ),
        TRUE
    );
$$ LANGUAGE SQL STABLE;
-- Trigger: تحديث patient_features
CREATE OR REPLACE FUNCTION update_patient_features() RETURNS TRIGGER AS $$ BEGIN
INSERT INTO patient_features (
        clinic_id,
        patient_phone,
        total_bookings,
        total_cancelled,
        total_no_show,
        last_booking_at
    )
VALUES (
        NEW.clinic_id,
        NEW.patient_phone,
        1,
        CASE
            WHEN NEW.status = 'cancelled' THEN 1
            ELSE 0
        END,
        CASE
            WHEN NEW.status = 'no_show' THEN 1
            ELSE 0
        END,
        NOW()
    ) ON CONFLICT (clinic_id, patient_phone) DO
UPDATE
SET total_bookings = patient_features.total_bookings + 1,
    total_cancelled = patient_features.total_cancelled + CASE
        WHEN NEW.status = 'cancelled' THEN 1
        ELSE 0
    END,
    total_no_show = patient_features.total_no_show + CASE
        WHEN NEW.status = 'no_show' THEN 1
        ELSE 0
    END,
    last_booking_at = NOW(),
    updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_patient_features ON bookings;
CREATE TRIGGER trg_patient_features
AFTER
INSERT
    OR
UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION update_patient_features();

-- ============================================
-- ترحيل v3.3 (أضفه في نهاية init.sql)
-- ============================================

-- 15. ملف تعريف العيادة (يقرأه المساعد الذكي)
CREATE TABLE IF NOT EXISTS clinic_profile (
    clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
    working_hours TEXT,
    services TEXT [],
    address TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إصلاح trigger ميزات المريض: العدّ عند الإدخال فقط،
-- وعند تغيّر الحالة نزيد عدّاد الإلغاء/الغياب فقط
CREATE OR REPLACE FUNCTION update_patient_features() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO patient_features (
            clinic_id, patient_phone, total_bookings,
            total_cancelled, total_no_show, last_booking_at
        ) VALUES (
            NEW.clinic_id, NEW.patient_phone, 1,
            CASE WHEN NEW.status = 'cancelled' THEN 1 ELSE 0 END,
            CASE WHEN NEW.status = 'no_show' THEN 1 ELSE 0 END,
            NOW()
        ) ON CONFLICT (clinic_id, patient_phone) DO UPDATE SET
            total_bookings = patient_features.total_bookings + 1,
            total_cancelled = patient_features.total_cancelled + CASE WHEN NEW.status = 'cancelled' THEN 1 ELSE 0 END,
            total_no_show = patient_features.total_no_show + CASE WHEN NEW.status = 'no_show' THEN 1 ELSE 0 END,
            last_booking_at = NOW(),
            updated_at = NOW();
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE patient_features SET
            total_cancelled = total_cancelled + CASE WHEN NEW.status = 'cancelled' THEN 1 ELSE 0 END,
            total_no_show = total_no_show + CASE WHEN NEW.status = 'no_show' THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE clinic_id = NEW.clinic_id AND patient_phone = NEW.patient_phone;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- الـ trigger نفسه (AFTER INSERT OR UPDATE OF status) لا يحتاج تغييراً