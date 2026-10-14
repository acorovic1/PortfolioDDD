import { pool } from '../config/db.ts';
import type { RenderRecord, RenderDTO } from '../types.ts';

// SQL condition for renders that are images (not videos) - the ones that
// can stand in as a cover or social preview. `alias` is the renders alias.
export function imageRenderCondition(alias = 'r'): string {
  return `${alias}.url !~* '\\.(mp4|webm)$'`;
}

export function toRenderDTO(row: RenderRecord): RenderDTO {
  return {
    id: row.id,
    url: row.url,
    caption: row.caption ?? '',
    createdAt: row.created_at,
  };
}

export async function findRendersByArtworkId(artworkId: string): Promise<RenderRecord[]> {
  const { rows } = await pool.query<RenderRecord>(
    'SELECT * FROM renders WHERE artwork_id = $1 ORDER BY created_at ASC',
    [artworkId]
  );
  return rows;
}

export async function findRendersByArtworkIds(artworkIds: string[]): Promise<Map<string, RenderRecord[]>> {
  const byArtwork = new Map<string, RenderRecord[]>();
  if (artworkIds.length === 0) return byArtwork;

  const { rows } = await pool.query<RenderRecord>(
    `SELECT * FROM renders WHERE artwork_id = ANY($1) ORDER BY created_at ASC`,
    [artworkIds]
  );
  for (const row of rows) {
    const list = byArtwork.get(row.artwork_id) ?? [];
    list.push(row);
    byArtwork.set(row.artwork_id, list);
  }
  return byArtwork;
}

export async function createRender(render: {
  id: string;
  artworkId: string;
  url: string;
  caption: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO renders (id, artwork_id, url, caption) VALUES ($1, $2, $3, $4)`,
    [render.id, render.artworkId, render.url, render.caption]
  );
}

export async function deleteRender(id: string, artworkId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM renders WHERE id = $1 AND artwork_id = $2',
    [id, artworkId]
  );
  return (result.rowCount ?? 0) > 0;
}
