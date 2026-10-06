-- Discovery: follows, view tracking, tags, publishing state and content flags.

CREATE TABLE IF NOT EXISTS follows (
  follower_id CHAR(36) NOT NULL,
  followee_id CHAR(36) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_followee FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_follows_not_self CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee_id, created_at);

-- One row per viewer per artwork per day (viewer_key is the user id, or a
-- hash of IP + user agent for anonymous visitors). `source` records where the
-- view came from (explore, following, search, profile, external, ...).
CREATE TABLE IF NOT EXISTS artwork_views (
  artwork_id CHAR(36) NOT NULL,
  viewer_key VARCHAR(64) NOT NULL,
  view_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(32) NOT NULL DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artwork_id, viewer_key, view_date),
  CONSTRAINT fk_views_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artwork_views_created ON artwork_views (artwork_id, created_at);

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  -- public: listed everywhere; unlisted: only reachable by link; private: owner only
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  -- NULL = draft, a future time = scheduled, a past time = published
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS is_mature BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  -- Set once followers have been told about the artwork going live.
  ADD COLUMN IF NOT EXISTS followers_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- Everything that existed before publishing states was live; don't announce
-- it to followers retroactively.
UPDATE artworks SET published_at = created_at, followers_notified = TRUE WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_published ON artworks (published_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_artworks_tags ON artworks USING GIN (tags);

ALTER TABLE users
  -- Viewer preferences
  ADD COLUMN IF NOT EXISTS show_mature BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hide_ai BOOLEAN NOT NULL DEFAULT FALSE,
  -- Creator opt-out: "NoAI" - don't use my work for AI training
  ADD COLUMN IF NOT EXISTS no_ai_training BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_likes_created ON likes (artwork_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments (artwork_id, created_at);
