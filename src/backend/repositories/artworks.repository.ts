import { pool } from '../config/db.ts';
import type { ArtworkRecord, ArtworkDTO, RenderRecord, CanvasSettings } from '../types.ts';
import { toRenderDTO } from './renders.repository.ts';
import { parseJsonArray } from '../utils/json.util.ts';

// SQL condition for artworks that have something to show: a processed model,
// or (2D and video artworks) the uploaded image or video.
function hasContent(alias: string): string {
  return `(${alias}.model_path <> '' OR ${alias}.image_path IS NOT NULL)`;
}

// SQL condition for artworks anyone may discover in listings (feeds, search,
// public portfolios): processed, public and published (not a draft, and not
// scheduled for later), by an account that isn't suspended. `alias` is the
// artworks table alias in the query.
export function listedCondition(alias = 'artworks'): string {
  return `${hasContent(alias)} AND ${alias}.visibility = 'public' AND ${alias}.published_at <= NOW()
    AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id = ${alias}.user_id AND su.suspended_at IS NOT NULL)`;
}

// Whether `viewerId` (null for anonymous) may open a single artwork: the
// owner always can; anyone else needs it processed, published and not private
// (unlisted artworks are reachable by link).
export function canViewArtwork(row: ArtworkRecord, viewerId: string | null): boolean {
  if (viewerId && row.user_id === viewerId) return true;
  return (row.model_path !== '' || row.image_path !== null)
    && row.visibility !== 'private'
    && row.published_at !== null
    && new Date(row.published_at).getTime() <= Date.now();
}

// Kinds shown as a canvas on an easel (no model).
export function isFlatKind(kind: ArtworkRecord['kind'] | undefined): boolean {
  return kind === 'image' || kind === 'video';
}

// A 2D artwork's canvas, in the current shape: early uploads could have
// mirrored edges and a size in cm, which are now black edges and no size.
function canvasFor(row: ArtworkRecord): CanvasSettings | null {
  const stored = row.canvas_settings;
  if (!isFlatKind(row.kind) || !stored) return null;
  return { edge: stored.edge === 'white' ? 'white' : 'black', medium: stored.medium ?? null };
}

export function toArtworkDTO(
  row: ArtworkRecord,
  renders: RenderRecord[],
  likeCount = 0,
  username?: string
): ArtworkDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    year: row.year ?? '',
    category: row.category ?? '',
    tools: parseJsonArray(row.tools),
    modelUrl: row.model_path,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    sourceFormat: row.source_format,
    modelVersion: row.model_version,
    // BIGINT comes back from pg as a string.
    modelSizeBytes: row.model_size_bytes === null ? null : Number(row.model_size_bytes),
    thumbnailUrl: row.thumbnail_path,
    tags: row.tags ?? [],
    visibility: row.visibility,
    publishedAt: row.published_at,
    isMature: row.is_mature,
    aiGenerated: row.ai_generated,
    viewCount: row.view_count,
    viewerSettings: row.viewer_settings,
    modelRotation: row.model_rotation ?? null,
    kind: row.kind ?? 'model',
    imageUrl: row.kind === 'image' ? row.image_path : null,
    videoUrl: row.kind === 'video' ? row.image_path : null,
    videoDuration: row.kind === 'video' ? row.video_duration : null,
    imageWidth: row.image_width ?? null,
    imageHeight: row.image_height ?? null,
    canvas: canvasFor(row),
    renders: renders.map(toRenderDTO),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likeCount,
    ...(username !== undefined ? { username } : {}),
  };
}

export async function findArtworksByUserId(
  userId: string,
  limit?: number,
  offset?: number,
  options: { viewableOnly?: boolean } = {}
): Promise<ArtworkRecord[]> {
  // Other people only see listed artworks; the owner also sees drafts,
  // private/unlisted ones and ones still processing (or whose upload failed).
  const viewable = options.viewableOnly ? `AND ${listedCondition()}` : '';

  // No limit means "all of this user's artworks" - used to rebuild someone's
  // own 3D scene, which must never be silently truncated by pagination.
  // In the artist's own order (see reorderArtworks). Ties fall back to
  // newest first, with `id` keeping same-instant uploads stable across
  // requests instead of reshuffling the 3D carousel between page loads.
  const order = 'ORDER BY sort_order ASC NULLS LAST, created_at DESC, id DESC';
  if (limit === undefined) {
    const { rows } = await pool.query<ArtworkRecord>(
      `SELECT * FROM artworks WHERE user_id = $1 ${viewable} ${order}`,
      [userId]
    );
    return rows;
  }

  const { rows } = await pool.query<ArtworkRecord>(
    `SELECT * FROM artworks WHERE user_id = $1 ${viewable} ${order} LIMIT $2 OFFSET $3`,
    [userId, limit, offset ?? 0]
  );
  return rows;
}

export async function findArtworkById(id: string): Promise<ArtworkRecord | null> {
  const { rows } = await pool.query<ArtworkRecord>(
    'SELECT * FROM artworks WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export type ArtworkRecordWithOwner = ArtworkRecord & { username: string };

// Looks artworks up across all users (e.g. resolving a liked-posts or saved
// list, whose entries may belong to anyone), so each row carries its owner's
// username along with it.
export async function findArtworksByIds(ids: string[]): Promise<ArtworkRecordWithOwner[]> {
  if (ids.length === 0) return [];

  const { rows } = await pool.query<ArtworkRecordWithOwner>(
    `SELECT artworks.*, users.username AS username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE artworks.id = ANY($1)`,
    [ids]
  );
  return rows;
}

export async function createArtwork(artwork: {
  id: string;
  userId: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  // The raw upload awaiting conversion; the model itself is filled in by the
  // processing pipeline (see markModelReady).
  pendingSourcePath: string;
  sourceFormat: string;
  // null = draft (not listed until published); a future time = scheduled.
  publishedAt: Date | null;
}): Promise<void> {
  await pool.query(
    // New uploads go to the end of the artist's order.
    `INSERT INTO artworks (id, user_id, title, description, year, category, tools, model_path,
                           processing_status, pending_source_path, source_format, published_at, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'processing', $8, $9, $10,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM artworks WHERE user_id = $2))`,
    [
      artwork.id,
      artwork.userId,
      artwork.title,
      artwork.description,
      artwork.year,
      artwork.category,
      JSON.stringify(artwork.tools),
      artwork.pendingSourcePath,
      artwork.sourceFormat,
      artwork.publishedAt,
    ]
  );
}

// A 2D (or video) artwork: the image or video is stored already, so it's
// ready right away.
export async function createImageArtwork(artwork: {
  id: string;
  userId: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  // 'video': imagePath is the video file.
  kind?: 'image' | 'video';
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  videoDuration?: number | null;
  thumbnailPath: string;
  canvas: CanvasSettings;
  publishedAt: Date | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO artworks (id, user_id, title, description, year, category, tools, model_path,
                           processing_status, kind, image_path, image_width, image_height,
                           thumbnail_path, canvas_settings, published_at, video_duration, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'ready', $14, $8, $9, $10, $11, $12, $13, $15,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM artworks WHERE user_id = $2))`,
    [
      artwork.id,
      artwork.userId,
      artwork.title,
      artwork.description,
      artwork.year,
      artwork.category,
      JSON.stringify(artwork.tools),
      artwork.imagePath,
      artwork.imageWidth,
      artwork.imageHeight,
      artwork.thumbnailPath,
      JSON.stringify(artwork.canvas),
      artwork.publishedAt,
      artwork.kind ?? 'image',
      artwork.videoDuration ?? null,
    ]
  );
}

// --- Model processing state ---

// Queues a new upload (a new version) for an existing artwork. Returns false
// if it's already processing one, so two uploads can't race each other.
export async function startModelReprocessing(id: string, pendingSourcePath: string, sourceFormat: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE artworks
     SET processing_status = 'processing', processing_error = NULL,
         pending_source_path = $2, source_format = $3, updated_at = NOW()
     WHERE id = $1 AND processing_status <> 'processing'`,
    [id, pendingSourcePath, sourceFormat]
  );
  return (result.rowCount ?? 0) > 0;
}

// Swaps in a freshly processed model. Returns the model path it replaced
// ('' for a first upload), or null if the artwork no longer exists.
export async function markModelReady(
  id: string,
  modelPath: string,
  sizeBytes: number,
  sourceFormat: string
): Promise<string | null> {
  const { rows } = await pool.query<{ previous_path: string }>(
    `UPDATE artworks AS a
     SET model_path = $2, model_size_bytes = $3, source_format = $4,
         model_version = CASE WHEN old.model_path = '' THEN a.model_version ELSE a.model_version + 1 END,
         processing_status = 'ready', processing_error = NULL, pending_source_path = NULL, updated_at = NOW()
     FROM (SELECT id, model_path FROM artworks WHERE id = $1 FOR UPDATE) AS old
     WHERE a.id = old.id
     RETURNING old.model_path AS previous_path`,
    [id, modelPath, sizeBytes, sourceFormat]
  );
  return rows[0]?.previous_path ?? null;
}

export async function markModelFailed(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE artworks
     SET processing_status = 'failed', processing_error = $2, pending_source_path = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id, error]
  );
}

// Uploads that were mid-processing when the server stopped.
export async function findInterruptedProcessing(): Promise<{ id: string; pending_source_path: string | null; source_format: string | null }[]> {
  const { rows } = await pool.query<{ id: string; pending_source_path: string | null; source_format: string | null }>(
    "SELECT id, pending_source_path, source_format FROM artworks WHERE processing_status = 'processing'"
  );
  return rows;
}

// Returns the previous thumbnail path so the caller can delete the file.
export async function setThumbnail(id: string, thumbnailPath: string): Promise<string | null> {
  const { rows } = await pool.query<{ previous_path: string | null }>(
    `UPDATE artworks AS a SET thumbnail_path = $2
     FROM (SELECT id, thumbnail_path FROM artworks WHERE id = $1 FOR UPDATE) AS old
     WHERE a.id = old.id
     RETURNING old.thumbnail_path AS previous_path`,
    [id, thumbnailPath]
  );
  return rows[0]?.previous_path ?? null;
}

export type ArtworkUpdate = Partial<{
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  tags: string[];
  visibility: string;
  publishedAt: string | null;
  isMature: boolean;
  aiGenerated: boolean;
  viewerSettings: Record<string, unknown> | null;
  modelRotation: [number, number, number, number] | null;
  canvas: CanvasSettings | null;
}>;

export async function updateArtwork(id: string, fields: ArtworkUpdate): Promise<void> {
  const columnMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    year: 'year',
    category: 'category',
    tools: 'tools',
    tags: 'tags',
    visibility: 'visibility',
    publishedAt: 'published_at',
    isMature: 'is_mature',
    aiGenerated: 'ai_generated',
    viewerSettings: 'viewer_settings',
    modelRotation: 'model_rotation',
    canvas: 'canvas_settings',
  };

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const setClause = entries.map(([key], i) => `${columnMap[key]} = $${i + 1}`).join(', ');
  const jsonColumns = new Set(['tools', 'viewerSettings', 'modelRotation', 'canvas']);
  const values = entries.map(([key, value]) => (jsonColumns.has(key) && value !== null ? JSON.stringify(value) : value));

  await pool.query(
    `UPDATE artworks SET ${setClause}, updated_at = NOW() WHERE id = $${values.length + 1}`,
    [...values, id]
  );
}

// Puts the given artworks of a user in the given order. Artworks left out
// (e.g. ones still processing, which the carousel doesn't show) keep their
// place: the listed ones are rearranged among the positions they hold now.
// Returns false if any id isn't one of the user's artworks.
export async function reorderArtworks(userId: string, artworkIds: string[]): Promise<boolean> {
  const current = (await findArtworksByUserId(userId)).map(a => a.id);
  const listed = new Set(artworkIds);
  if (artworkIds.some(id => !current.includes(id))) return false;

  const reordered = [...artworkIds];
  const order = current.map(id => (listed.has(id) ? reordered.shift()! : id));

  await pool.query(
    `UPDATE artworks a SET sort_order = o.position
     FROM unnest($1::text[]) WITH ORDINALITY AS o(id, position)
     WHERE a.id = o.id AND a.user_id = $2`,
    [order, userId]
  );
  return true;
}

export async function deleteArtwork(id: string): Promise<void> {
  await pool.query('DELETE FROM artworks WHERE id = $1', [id]);
}

export type ArtworkSearchResult = {
  id: string;
  title: string;
  category: string;
  year: string;
  username: string;
};

// An ILIKE pattern finding `query` anywhere; LIKE wildcards the user typed
// (% and _) are matched literally.
export function containsPattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

// SQL condition: the artwork's title, description, category, tags or
// software used match `pattern` (a containsPattern parameter, e.g. '$1') -
// "zbr" finds artworks made in ZBrush. The one definition of artwork search,
// shared by the toolbar's quick results and Explore.
export function artworkTextMatch(alias: string, pattern: string): string {
  return `(${alias}.title ILIKE ${pattern}
    OR ${alias}.description ILIKE ${pattern}
    OR ${alias}.category ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM unnest(${alias}.tags) AS tag WHERE tag ILIKE ${pattern})
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(${alias}.tools, '[]'::jsonb)) AS t(tool)
      WHERE t.tool ILIKE ${pattern}
    ))`;
}

// Quick results for the toolbar search. Title matches come first.
export async function searchArtworks(query: string, limit: number, offset: number): Promise<ArtworkSearchResult[]> {
  // Postgres LIKE is case-sensitive; ILIKE keeps search case-insensitive.
  const { rows } = await pool.query<ArtworkSearchResult>(
    `SELECT artworks.id, artworks.title, artworks.category, artworks.year, users.username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE ${listedCondition()} AND ${artworkTextMatch('artworks', '$1')}
     ORDER BY (artworks.title ILIKE $1) DESC, artworks.published_at DESC
     LIMIT $2 OFFSET $3`,
    [containsPattern(query), limit, offset]
  );
  return rows;
}
