-- Moderation: roles, suspensions, blocks and reports.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id CHAR(36) NOT NULL,
  blocked_id CHAR(36) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);

-- target_id refers to an artwork, comment or user depending on target_type
-- (no FK: the target may be deleted as the outcome of the report).
CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  reporter_id CHAR(36) NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id CHAR(36) NOT NULL,
  -- The reported user (artwork/comment author, or the user themselves).
  target_user_id CHAR(36) NULL,
  reason VARCHAR(32) NOT NULL,
  details TEXT NULL,
  -- Snapshot of the reported content, kept even if it's later deleted.
  target_summary TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  resolution VARCHAR(32) NULL,
  resolution_note TEXT NULL,
  resolved_by CHAR(36) NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_resolver FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_type, target_id);
-- One open report per person per target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_open_per_reporter
  ON reports (reporter_id, target_type, target_id) WHERE status = 'open';
