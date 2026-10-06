-- Server-side model processing: uploads in any supported format are converted
-- to an optimized GLB in the background, tracked by processing_status.
--
-- model_path stays '' until the first successful conversion. A re-upload
-- (new version) keeps serving the current model_path while it's processed,
-- so likes/comments/renders stay attached to the same artwork throughout.
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(16) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS pending_source_path VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS source_format VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS model_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS model_size_bytes BIGINT NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(512) NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_processing_status ON artworks (processing_status);
