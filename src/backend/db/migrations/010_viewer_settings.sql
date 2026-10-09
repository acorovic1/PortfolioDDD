-- The artist's saved default view for the 3D inspector (lighting,
-- post-processing, background, camera angle). NULL = app defaults.
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS viewer_settings JSONB NULL;
