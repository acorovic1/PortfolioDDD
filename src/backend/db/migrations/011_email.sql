-- Email verification and notification emails.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_verify_token_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ NULL,
  -- Unread notifications are emailed as a digest unless this is off.
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

-- NULL = not handled by the digest mailer yet.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ NULL;

-- Notifications from before this migration are never emailed.
UPDATE notifications SET emailed_at = created_at WHERE emailed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_unemailed ON notifications(created_at) WHERE emailed_at IS NULL;
