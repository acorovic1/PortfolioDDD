-- Video artworks (kind = 'video'): an uploaded MP4/WebM, played on the easel
-- canvas like a 2D artwork. They share the 2D columns: image_path holds the
-- video file, image_width/image_height its frame size, canvas_settings its
-- canvas; thumbnail_path is a frame the uploader's browser grabbed.
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS video_duration REAL NULL;
