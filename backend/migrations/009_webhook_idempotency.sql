ALTER TABLE message_logs
  ADD COLUMN webhook_message_id TEXT,
  ADD COLUMN webhook_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (webhook_status IN ('not_applicable', 'pending', 'processing', 'completed', 'failed')),
  ADD COLUMN webhook_attempts INT NOT NULL DEFAULT 0 CHECK (webhook_attempts >= 0),
  ADD COLUMN webhook_locked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_message_logs_webhook_id
  ON message_logs (clinic_id, channel, webhook_message_id)
  WHERE webhook_message_id IS NOT NULL;