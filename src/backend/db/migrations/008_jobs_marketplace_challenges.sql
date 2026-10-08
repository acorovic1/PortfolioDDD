-- Jobs board, marketplace listings and community challenges.

CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  poster_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  company VARCHAR(120) NOT NULL,
  location VARCHAR(120) NOT NULL DEFAULT '',
  -- onsite / hybrid / remote
  workplace VARCHAR(16) NOT NULL DEFAULT 'onsite',
  -- full_time / part_time / contract / freelance / internship
  employment_type VARCHAR(16) NOT NULL DEFAULT 'full_time',
  salary VARCHAR(80) NULL,
  description TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  -- External application link; without one, people apply through the site.
  apply_url VARCHAR(512) NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  CONSTRAINT fk_jobs_poster FOREIGN KEY (poster_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_open ON jobs (is_open, created_at DESC);

CREATE TABLE IF NOT EXISTS job_applications (
  job_id CHAR(36) NOT NULL,
  applicant_id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, applicant_id),
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_applicant FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One marketplace listing per artwork; price 0 = free download.
CREATE TABLE IF NOT EXISTS listings (
  id CHAR(36) PRIMARY KEY,
  artwork_id CHAR(36) NOT NULL UNIQUE,
  seller_id CHAR(36) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  -- personal / commercial / editorial / cc_by / cc0
  license VARCHAR(16) NOT NULL DEFAULT 'personal',
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_listings_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  CONSTRAINT fk_listings_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listing_downloads (
  listing_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (listing_id, user_id),
  CONSTRAINT fk_downloads_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_downloads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenges (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  brief TEXT NOT NULL,
  rules TEXT NULL,
  prize VARCHAR(200) NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_challenges_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_challenges_dates CHECK (ends_at > starts_at)
);

-- One entry per person per challenge.
CREATE TABLE IF NOT EXISTS challenge_entries (
  challenge_id CHAR(36) NOT NULL,
  artwork_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, artwork_id),
  CONSTRAINT uq_challenge_entry_user UNIQUE (challenge_id, user_id),
  CONSTRAINT fk_entries_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_entries_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  CONSTRAINT fk_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenge_votes (
  challenge_id CHAR(36) NOT NULL,
  artwork_id CHAR(36) NOT NULL,
  voter_id CHAR(36) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, artwork_id, voter_id),
  CONSTRAINT fk_votes_entry FOREIGN KEY (challenge_id, artwork_id) REFERENCES challenge_entries(challenge_id, artwork_id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_voter FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE
);
