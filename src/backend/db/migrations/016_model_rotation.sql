-- The artist's rotation of the model in the carousel, as a unit quaternion
-- [x, y, z, w] turning the model around its center. NULL = as uploaded.
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS model_rotation JSONB NULL;
