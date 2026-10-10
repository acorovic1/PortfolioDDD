-- Two-factor authentication (TOTP) and session revocation.
ALTER TABLE users
  -- Encrypted TOTP secret; set once two-factor is switched on.
  ADD COLUMN IF NOT EXISTS totp_secret TEXT NULL,
  -- A secret being set up, not confirmed with a code yet.
  ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ NULL,
  -- Last accepted 30-second step: codes can't be reused.
  ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NULL,
  -- SHA-256 hashes of the unused recovery codes.
  ADD COLUMN IF NOT EXISTS totp_recovery_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Part of every session token: bumping it signs out every session.
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
