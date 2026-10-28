-- ============================================
-- Sahel Systems v4 — Schema + Row-Level Security
-- Timezone: Asia/Riyadh | PostgreSQL 15+
-- ============================================
SET timezone = 'Asia/Riyadh';

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- App role used by the API (sets clinic_id via SET LOCAL)
DO $$ BEGIN
  CREATE ROLE sahel_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 1. IAM — plans, clinics, users, refresh tokens
-- ============================================
CREATE TABLE plans (
  id          TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  price_sar   NUMERIC(10,2) NOT NULL,
  max_doctors INT,
  max_msgs    INT,
  features    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name_ar, price_sar, max_doctors, max_msgs, features) VALUES
  ('starter',  'أساسية',  299,  3,  2000, '{"wa":true,"ig":false,"ai":false,"reports":"basic"}'),
  ('growth',   'نمو',     469,  8,  8000, '{"wa":true,"ig":true,"ai":true,"reports":"standard"}'),
  ('scale',    'توسع',    759,  NULL, NULL, '{"wa":true,"ig":true,"ai":true,"reports":"advanced","predict":true}');

CREATE TABLE clinics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  city            TEXT,
  address         TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  reminder_hours  INT NOT NULL DEFAULT 3,
  channels        JSONB NOT NULL DEFAULT '{"whatsapp":true,"instagram":false}',
  plan_id         TEXT REFERENCES plans(id) DEFAULT 'starter',
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','past_due','suspended','cancelled')),
  subscription_ends_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'clinic_admin',
  'doctor',
  'receptionist'
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID REFERENCES clinics(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role          user_role NOT NULL DEFAULT 'receptionist',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_clinic_required CHECK (
    role = 'super_admin' OR clinic_id IS NOT NULL
  )
);

CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

-- ============================================
-- 2. Clinic Management — doctors, schedules, staff
-- ============================================
CREATE TABLE doctors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name    TEXT NOT NULL,
  specialty    TEXT,
  slot_minutes INT NOT NULL DEFAULT 30,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doctors_clinic ON doctors(clinic_id);

CREATE TABLE doctor_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (doctor_id, weekday, start_time)
);

CREATE INDEX idx_schedules_doctor ON doctor_schedules(doctor_id);

CREATE TABLE patients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name   TEXT,
  phone       TEXT NOT NULL,
  source      TEXT DEFAULT 'whatsapp',
  notes       TEXT,
  no_show_count INT NOT NULL DEFAULT 0,
  visit_count INT NOT NULL DEFAULT 0,
  risk_score  NUMERIC(4,3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, phone)
);

CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_phone ON patients(clinic_id, phone);

CREATE TABLE consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_text    TEXT,
  consent_version TEXT NOT NULL DEFAULT 'v1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  UNIQUE (clinic_id, patient_id)
);

-- ============================================
-- 3. Appointment Engine
-- ============================================
CREATE TYPE appointment_status AS ENUM (
  'pending',
  'confirmed',
  'waiting',
  'completed',
  'no_show',
  'cancelled'
);

CREATE TABLE appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id       UUID NOT NULL REFERENCES doctors(id),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'confirmed',
  source          TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (source IN ('whatsapp','instagram','portal','walk_in','admin')),
  service         TEXT,
  reminder_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_payment_id TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- Prevent overlapping appointments for the same doctor (EXCLUDE)
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed','waiting'));

CREATE INDEX idx_appt_clinic_starts ON appointments(clinic_id, starts_at);
CREATE INDEX idx_appt_doctor_starts ON appointments(doctor_id, starts_at);
CREATE INDEX idx_appt_patient ON appointments(patient_id);
CREATE INDEX idx_appt_status ON appointments(clinic_id, status);

CREATE TABLE waiting_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doctor_id     UUID REFERENCES doctors(id) ON DELETE SET NULL,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  desired_date  DATE,
  preferred_time TIME,
  service       TEXT,
  priority      INT NOT NULL DEFAULT 100,
  status        TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','offered','booked','expired','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wait_clinic ON waiting_list(clinic_id, status, priority, created_at);

-- ============================================
-- 4. Omnichannel Messaging
-- ============================================
CREATE TABLE clinic_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram')),
  phone_number_id TEXT,
  external_id     TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  webhook_secret  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, external_id)
);

CREATE INDEX idx_clinic_tokens_clinic ON clinic_tokens(clinic_id);

CREATE TABLE message_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id  UUID REFERENCES patients(id) ON DELETE SET NULL,
  channel     TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  body        TEXT,
  meta        JSONB DEFAULT '{}',
  handoff     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_clinic ON message_logs(clinic_id, created_at DESC);

-- ============================================
-- 5. Billing
-- ============================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  amount_sar      NUMERIC(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  provider        TEXT NOT NULL DEFAULT 'moyasar',
  provider_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','refunded')),
  purpose         TEXT NOT NULL DEFAULT 'subscription'
    CHECK (purpose IN ('subscription','deposit')),
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ
);

CREATE INDEX idx_payments_clinic ON payments(clinic_id, created_at DESC);

-- ============================================
-- 6. Audit & Analytics helpers
-- ============================================
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  clinic_id   UUID,
  actor_id    UUID,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     JSONB DEFAULT '{}',
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_clinic ON audit_logs(clinic_id, created_at DESC);

-- ============================================
-- RLS: tenant isolation
-- ============================================
-- Session variable: SET LOCAL app.clinic_id = '<uuid>';
-- Super-admin bypass: SET LOCAL app.is_super = 'true';

CREATE OR REPLACE FUNCTION app_clinic_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.clinic_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_super() RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.is_super', true), 'false') = 'true';
$$ LANGUAGE sql STABLE;

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors FORCE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_list FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Clinics: tenant sees own row; super sees all
CREATE POLICY clinics_tenant ON clinics
  USING (app_is_super() OR id = app_clinic_id());

CREATE POLICY users_tenant ON users
  USING (app_is_super() OR clinic_id = app_clinic_id() OR role = 'super_admin');

CREATE POLICY doctors_tenant ON doctors
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY schedules_tenant ON doctor_schedules
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY patients_tenant ON patients
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY consents_tenant ON consents
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY appointments_tenant ON appointments
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY waiting_tenant ON waiting_list
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY tokens_tenant ON clinic_tokens
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY messages_tenant ON message_logs
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY payments_tenant ON payments
  USING (app_is_super() OR clinic_id = app_clinic_id());

CREATE POLICY audit_tenant ON audit_logs
  USING (app_is_super() OR clinic_id = app_clinic_id() OR clinic_id IS NULL);

-- Grant table access to app role (RLS still applies)
GRANT USAGE ON SCHEMA public TO sahel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sahel_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sahel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sahel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sahel_app;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_doctors_updated BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
