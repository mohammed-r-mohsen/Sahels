CREATE TABLE appointment_reminders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts            INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at           TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  external_message_id TEXT,
  patient_response    TEXT
                        CHECK (patient_response IN ('confirmed', 'may_be_late', 'human')),
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id)
);

CREATE INDEX idx_appointment_reminders_due
  ON appointment_reminders(status, next_attempt_at);

ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY appointment_reminders_tenant ON appointment_reminders
  USING (app_is_super() OR clinic_id = app_clinic_id())
  WITH CHECK (app_is_super() OR clinic_id = app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_reminders TO sahel_app;

ALTER TABLE message_logs
  ADD COLUMN handoff_resolved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_message_logs_open_handoffs
  ON message_logs(clinic_id, created_at DESC)
  WHERE handoff = TRUE AND handoff_resolved = FALSE;

ALTER TABLE clinics ALTER COLUMN reminder_hours SET DEFAULT 4;
UPDATE clinics SET reminder_hours = 4;
