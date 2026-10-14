-- Message safety: who may start a conversation with you, and who started
-- each conversation (for the daily cap on new conversations).

-- 'everyone', 'following' (people you follow) or 'nobody'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS messages_from VARCHAR(16) NOT NULL DEFAULT 'everyone';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_messages_from') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_messages_from
      CHECK (messages_from IN ('everyone', 'following', 'nobody'));
  END IF;
END $$;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS started_by CHAR(36) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_started_by') THEN
    ALTER TABLE conversations ADD CONSTRAINT fk_conversations_started_by
      FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Older conversations: whoever sent the first message.
UPDATE conversations c SET started_by = (
  SELECT m.sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at ASC LIMIT 1
)
WHERE c.started_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_started_by ON conversations (started_by, created_at);
