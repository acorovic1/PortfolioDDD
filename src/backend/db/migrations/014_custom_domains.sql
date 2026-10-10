-- An artist's own domain (portfolio.example.com) serving their profile.
-- It only goes live once a DNS TXT record proves they control it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(253) NULL,
  ADD COLUMN IF NOT EXISTS custom_domain_token CHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_custom_domain ON users(custom_domain) WHERE custom_domain IS NOT NULL;
