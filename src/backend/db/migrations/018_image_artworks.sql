-- 2D artworks: an uploaded image shown in the carousel as a stretched canvas
-- on an easel, instead of a 3D model. kind = 'model' (default) or 'image'.
-- Image artworks have no model (model_path stays '') and are ready as soon
-- as they're uploaded. canvas_settings holds how the canvas is presented:
-- { edge: 'black' | 'white', medium }; its size follows the image's resolution.
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'model',
  ADD COLUMN IF NOT EXISTS image_path VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS image_width INTEGER NULL,
  ADD COLUMN IF NOT EXISTS image_height INTEGER NULL,
  ADD COLUMN IF NOT EXISTS canvas_settings JSONB NULL;
