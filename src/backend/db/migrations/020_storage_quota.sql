-- Per-account storage quota. stored_files is a ledger of every file kept in
-- storage (local disk or the bucket) and whose upload it was: a row is added
-- when a file is stored and removed when it's deleted, so an account's usage
-- is the sum of its rows - what it actually costs to host.
CREATE TABLE IF NOT EXISTS stored_files (
  url TEXT PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stored_files_user_id_idx ON stored_files (user_id);

-- NULL: the default quota (STORAGE_QUOTA_MB). Set per account for upgrades.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NULL;
