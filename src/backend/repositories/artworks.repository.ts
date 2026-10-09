import { pool } from '../config/db.ts';
import type { ArtworkRecord, ArtworkDTO, RenderRecord } from '../types.ts';
import { toRenderDTO } from './renders.repository.ts';
import { parseJsonArray } from '../utils/json.util.ts';

// SQL condition for artworks anyone may discover in listings (feeds, search,
// public portfolios): processed, public and published (not a draft, and not
// scheduled for later), by an account that isn't suspended. `alias` is the
// artworks table alias in the query.
export function listedCondition(alias = 'artworks'): string {
  return `${alias}.model_path <> '' AND ${alias}.visibility = 'public' AND ${alias}.published_at <= NOW()
    AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id = ${alias}.user_id AND su.suspended_at IS NOT NULL)`;
}

// Whether `viewerId` (null for anonymous) may open a single artwork: the
// owner always can; anyone else needs it processed, published and not private
// (unlisted artworks are reachable by link).
export function canViewArtwork(row: ArtworkRecord, viewerId: string | null): boolean {
  if (viewerId && row.user_id === viewerId) return true;
  return row.model_path !== ''
    && row.visibility !== 'private'
    && row.published_at !== null
    && new Date(row.published_at).getTime() <= Date.now();
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
  // Artworks created in the same instant tie on `created_at` - `id` as a
  // secondary key keeps the order stable across requests instead of
  // shuffling (which visibly reshuffles the 3D carousel between page loads).
  if (limit === undefined) {
    const { rows } = await pool.query<ArtworkRecord>(
      `SELECT * FROM artworks WHERE user_id = $1 ${viewable} ORDER BY created_at DESC, id DESC`,
      [userId]
    );
    return rows;
  }

  const { rows } = await pool.query<ArtworkRecord>(
    `SELECT * FROM artworks WHERE user_id = $1 ${viewable} ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
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
  // Drafts get no publish time (and aren't listed) until published.
  draft?: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO artworks (id, user_id, title, description, year, category, tools, model_path,
                           processing_status, pending_source_path, source_format, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'processing', $8, $9, CASE WHEN $10 THEN NULL ELSE NOW() END)`,
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
      artwork.draft ?? false,
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
  };

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const setClause = entries.map(([key], i) => `${columnMap[key]} = $${i + 1}`).join(', ');
  const jsonColumns = new Set(['tools', 'viewerSettings']);
  const values = entries.map(([key, value]) => (jsonColumns.has(key) && value !== null ? JSON.stringify(value) : value));

  await pool.query(
    `UPDATE artworks SET ${setClause}, updated_at = NOW() WHERE id = $${values.length + 1}`,
    [...values, id]
  );
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

export async function searchArtworks(query: string, limit: number, offset: number): Promise<ArtworkSearchResult[]> {
  const like = `%${query}%`;
  // Postgres LIKE is case-sensitive; ILIKE keeps search case-insensitive.
  const { rows } = await pool.query<ArtworkSearchResult>(
    `SELECT artworks.id, artworks.title, artworks.category, artworks.year, users.username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE ${listedCondition()}
       AND (artworks.title ILIKE $1 OR $2 = ANY(artworks.tags) OR artworks.category ILIKE $1 OR artworks.description ILIKE $1)
     ORDER BY artworks.published_at DESC
     LIMIT $3 OFFSET $4`,
    [like, query.trim().toLowerCase(), limit, offset]
  );
  return rows;
}
