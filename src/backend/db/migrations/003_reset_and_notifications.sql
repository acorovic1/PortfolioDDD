ALTER TABLE users
  ADD COLUMN reset_token_hash CHAR(64) NULL,
  ADD COLUMN reset_token_expires DATETIME NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  actor_username VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  message VARCHAR(512) NOT NULL,
  artwork_id CHAR(36) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at);
