-- Old usernames, so links to a renamed profile keep working (redirecting to
-- the new name), and so nobody else can grab a just-abandoned name to
-- impersonate its previous owner.
CREATE TABLE IF NOT EXISTS username_history (
  old_username VARCHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_username_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id);
