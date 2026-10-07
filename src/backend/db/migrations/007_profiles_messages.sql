-- Richer profiles and direct messages.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cover_url VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS website VARCHAR(255) NULL,
  -- { artstation, sketchfab, instagram, x, youtube, behance }: profile URLs
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS available_for_work BOOLEAN NOT NULL DEFAULT FALSE,
  -- freelance / full_time / contract / commissions
  ADD COLUMN IF NOT EXISTS work_types TEXT[] NOT NULL DEFAULT '{}',
  -- [{ role, company, location, start, end, description }]
  ADD COLUMN IF NOT EXISTS experience JSONB NOT NULL DEFAULT '[]'::jsonb;

-- One conversation per pair of users; user_a < user_b keeps the pair unique.
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,
  user_a CHAR(36) NOT NULL,
  user_b CHAR(36) NOT NULL,
  user_a_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_b_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_conversations_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_conversations_order CHECK (user_a < user_b),
  CONSTRAINT uq_conversations_pair UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations (user_b, last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  -- 'message', or 'hire' for a "Hire me" request (details in meta)
  kind VARCHAR(16) NOT NULL DEFAULT 'message',
  meta JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
