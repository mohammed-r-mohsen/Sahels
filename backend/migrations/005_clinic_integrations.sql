CREATE TABLE clinic_channel_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram')),
  external_id           TEXT NOT NULL,
  phone_number_id       TEXT,
  business_account_id   TEXT,
  page_id               TEXT,
  access_token_encrypted BYTEA,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, channel),
  CHECK (NOT is_active OR (external_id <> '' AND access_token_encrypted IS NOT NULL))
);

CREATE UNIQUE INDEX idx_channel_integrations_external
  ON clinic_channel_integrations(channel, external_id)
  WHERE is_active;

ALTER TABLE clinic_channel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_channel_integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY channel_integrations_tenant ON clinic_channel_integrations
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_channel_integrations TO sahel_app;

CREATE TABLE clinic_ai_settings (
  clinic_id             UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  enabled               BOOLEAN NOT NULL DEFAULT FALSE,
  arabic_model          TEXT NOT NULL DEFAULT 'allam:7b',
  booking_model         TEXT NOT NULL DEFAULT 'qwen2.5:7b',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(arabic_model) BETWEEN 1 AND 120),
  CHECK (length(booking_model) BETWEEN 1 AND 120)
);

ALTER TABLE clinic_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_ai_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY clinic_ai_settings_tenant ON clinic_ai_settings
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_ai_settings TO sahel_app;
