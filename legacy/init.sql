-- ============================================
-- Sahels v3.3 - Database Schema
-- PostgreSQL 15+ | Timezone: Asia/Riyadh
-- ============================================
SET timezone = 'Asia/Riyadh';
-- ============================================
-- 1. العيادات
-- ============================================
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
-- ============================================
-- 2. قنوات الاتصال (WhatsApp + Instagram)
-- ============================================
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
-- ============================================
-- 3. موافقات المرضى (PDPL)
-- ============================================
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
-- ============================================
-- 4. الحجوزات
-- ============================================
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
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (clinic_id, status);
-- ============================================
-- 5. قائمة الانتظار
-- ============================================
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
-- ============================================
-- 6. سجل الوصول (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  clinic_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logs_clinic ON access_logs (clinic_id, created_at DESC);
-- ============================================
-- 7. العيادات المركزية (Central Dashboard)
-- ============================================
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
-- ============================================
-- 8. الاشتراكات
-- ============================================
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
-- ============================================
-- 9. الميزات (Feature Flags)
-- ============================================
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
-- ============================================
-- 10. إعدادات العربون
-- ============================================
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
-- ============================================
-- 11. المدفوعات
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  booking_id INT,
  moyasar_id TEXT,
  amount_sar NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'failed', 'refunded')
  ),
  payment_url TEXT,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_clinic ON payments(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
-- ============================================
-- 12. اشتراكات التقارير
-- ============================================
CREATE TABLE IF NOT EXISTS report_subscriptions (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'webhook')),
  destination TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  report_type TEXT NOT NULL CHECK (report_type IN ('summary', 'per_clinic', 'full')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================
-- 13. سجل التقارير
-- ============================================
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
-- ============================================
-- 14. ميزات المريض (للتنبؤ بالإلغاء)
-- ============================================
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
-- ============================================
-- 15. ملف تعريف العيادة (يقرأه المساعد الذكي)
-- ============================================
CREATE TABLE IF NOT EXISTS clinic_profile (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  working_hours JSONB DEFAULT '{}'::jsonb,
  services JSONB DEFAULT '[]'::jsonb,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  insurance_list JSONB DEFAULT '[]'::jsonb,
  extra JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinic_profile_clinic ON clinic_profile(clinic_id);
-- ============================================
-- Helper Functions
-- ============================================
-- هل الاشتراك فعّال؟
CREATE OR REPLACE FUNCTION is_subscription_active(p_clinic_id TEXT) RETURNS BOOLEAN AS $$
SELECT EXISTS (
    SELECT 1
    FROM clinic_subscriptions
    WHERE clinic_id = p_clinic_id
      AND status = 'active'
      AND ends_at > NOW()
  );
$$ LANGUAGE SQL STABLE;
-- هل الميزة مفعّلة؟
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
-- ============================================
-- Trigger: تحديث patient_features
-- - عند INSERT: زيادة total_bookings
-- - عند UPDATE الحالة: زيادة العدادات فقط (بدون زيادة total_bookings)
-- ============================================
CREATE OR REPLACE FUNCTION update_patient_features() RETURNS TRIGGER AS $$ BEGIN IF TG_OP = 'INSERT' THEN
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
ELSIF TG_OP = 'UPDATE'
AND OLD.status IS DISTINCT
FROM NEW.status THEN
UPDATE patient_features
SET total_cancelled = total_cancelled + CASE
    WHEN NEW.status = 'cancelled' THEN 1
    ELSE 0
  END,
  total_no_show = total_no_show + CASE
    WHEN NEW.status = 'no_show' THEN 1
    ELSE 0
  END,
  updated_at = NOW()
WHERE clinic_id = NEW.clinic_id
  AND patient_phone = NEW.patient_phone;
END IF;
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
-- Row-Level Security (RLS) - عزل بيانات العيادات
-- ============================================
-- ملاحظة: RLS يحتاج تطبيق set_config في التطبيق قبل كل استعلام
-- ALTER TABLE bookings          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE consents          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE waiting_list      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE access_logs       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE patient_features  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE clinic_profile    ENABLE ROW LEVEL SECURITY;
-- (يُفعَّل لاحقاً عند ترقية الأمان)
-- ============================================
-- بيانات افتراضية للعيادة التجريبية
-- ⚠️ احذف هذا القسم في الإنتاج
-- ============================================
INSERT INTO clinic_profile (
    clinic_id,
    services,
    address,
    phone,
    working_hours
  )
VALUES (
    'test_clinic',
    '["كشف", "استشارة", "متابعة", "تحاليل"]'::jsonb,
    'الرياض - حي النخيل',
    '+966500000000',
    '{"saturday_to_thursday": "9:00-17:00", "friday": "closed"}'::jsonb
  ) ON CONFLICT (clinic_id) DO NOTHING;
-- ============================================
-- v3.4: مواعيد كل عيادة + سعة الحجز
-- ============================================
-- جدول ساعات العمل لكل عيادة
CREATE TABLE IF NOT EXISTS clinic_slots (
  id SERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (
    day_of_week BETWEEN 0 AND 6
  ),
  -- 0=الأحد، 6=السبت
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  -- مدة كل موعد
  capacity INT NOT NULL DEFAULT 1,
  -- عدد الأطباء المتاحين في نفس الوقت
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, day_of_week, start_time)
);
CREATE INDEX IF NOT EXISTS idx_clinic_slots_clinic ON clinic_slots(clinic_id, day_of_week)
WHERE is_active = TRUE;
-- حقل capacity في bookings (للتحقق السريع)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS slot_capacity INT DEFAULT 1;
-- ============================================
-- إزالة UNIQUE القديم واستبداله بـ partial index
-- (يسمح بعدة حجوزات في نفس الوقت إذا كانت السعة > 1)
-- ============================================
DROP INDEX IF EXISTS uniq_booking_slot;
-- فهرس جديد: فريد فقط عندما تكون السعة = 1
-- (التحقق من السعة > 1 يتم في الكود مع advisory lock)
CREATE INDEX IF NOT EXISTS idx_booking_lookup ON bookings (clinic_id, date, time)
WHERE status IN ('pending', 'confirmed');
-- ============================================
-- نهاية الملف
-- ============================================
-- ============================================
-- v3.5: نظام الأطباء والجداول
-- ============================================
-- جدول الأطباء
CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  specialty TEXT,
  -- التخصص (اختياري)
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hired_at DATE DEFAULT CURRENT_DATE,
  left_at DATE,
  -- تاريخ المغادرة (إن غادر)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic ON doctors(clinic_id, is_active)
WHERE is_active = TRUE;
-- جدول عمل كل طبيب (قد يكون للطبيب أكثر من فترة)
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (
    day_of_week BETWEEN 0 AND 6
  ),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_clinic ON doctor_schedules(clinic_id, day_of_week)
WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON doctor_schedules(doctor_id)
WHERE is_active = TRUE;
-- ============================================
-- ربط كل حجز بطبيب معين (اختياري)
-- ============================================
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS doctor_id INT REFERENCES doctors(id) ON DELETE
SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_doctor ON bookings(doctor_id)
WHERE doctor_id IS NOT NULL;