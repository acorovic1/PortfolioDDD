-- Space held for uploads in flight: taken (under a lock on the account's row)
-- when an upload is accepted, released once its files are recorded in
-- stored_files - so simultaneous uploads can't each see the same free space.
-- A model's reservation lasts until it has been processed. Reservations older
-- than an hour are left over from a crash and no longer count.
CREATE TABLE IF NOT EXISTS storage_reservations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS storage_reservations_user_id_idx ON storage_reservations (user_id);
