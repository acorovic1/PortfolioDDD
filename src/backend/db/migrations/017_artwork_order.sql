-- The order of an artist's artworks in their carousel and profile, set by
-- dragging in edit mode. Existing artworks keep the order they were shown in
-- (newest first); new uploads are appended at the end.
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sort_order INTEGER NULL;

UPDATE artworks a
SET sort_order = ranked.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS position
  FROM artworks
) ranked
WHERE a.id = ranked.id AND a.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_user_order ON artworks(user_id, sort_order);
