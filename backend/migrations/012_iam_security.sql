ALTER TABLE users
  ADD COLUMN sessions_revoked_before TIMESTAMPTZ;

ALTER TABLE refresh_tokens
  ADD COLUMN user_agent TEXT NOT NULL DEFAULT 'Unknown device';

CREATE TABLE user_mfa (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  secret_encrypted BYTEA NOT NULL,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa FORCE ROW LEVEL SECURITY;
CREATE POLICY user_mfa_tenant ON user_mfa
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa TO sahel_app;

CREATE TABLE mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_recovery_user_unused
  ON mfa_recovery_codes(user_id, created_at)
  WHERE used_at IS NULL;

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY mfa_recovery_tenant ON mfa_recovery_codes
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_recovery_codes TO sahel_app;

CREATE TABLE auth_security_events (
  id BIGSERIAL PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_sha256 TEXT NOT NULL,
  event TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_security_events_created
  ON auth_security_events(created_at DESC);

ALTER TABLE auth_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_security_events_super_only ON auth_security_events
  USING (app_is_super())
  WITH CHECK (app_is_super());
GRANT SELECT, INSERT ON auth_security_events TO sahel_app;
GRANT USAGE, SELECT ON SEQUENCE auth_security_events_id_seq TO sahel_app;