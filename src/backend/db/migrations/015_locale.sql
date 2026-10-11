-- The account's interface language (en, bs, de); NULL = the browser's.
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(8) NULL;
