import { pool } from '../config/db.ts';
import type { RenderRecord, RenderDTO } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export function toRenderDTO(row: RenderRecord): RenderDTO {
  return {
    id: row.id,
    url: row.url,
    caption: row.caption ?? '',
    createdAt: row.created_at,
  };
}

export async function findRendersByArtworkId(artworkId: string): Promise<RenderRecord[]> {
  const [rows] = await pool.query<(RenderRecord & RowDataPacket)[]>(
    'SELECT * FROM renders WHERE artwork_id = ? ORDER BY created_at ASC',
    [artworkId]
  );
  return rows;
}

export async function findRendersByArtworkIds(artworkIds: string[]): Promise<Map<string, RenderRecord[]>> {
  const byArtwork = new Map<string, RenderRecord[]>();
  if (artworkIds.length === 0) return byArtwork;

  const [rows] = await pool.query<(RenderRecord & RowDataPacket)[]>(
    `SELECT * FROM renders WHERE artwork_id IN (?) ORDER BY created_at ASC`,
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
  await pool.query<ResultSetHeader>(
    `INSERT INTO renders (id, artwork_id, url, caption) VALUES (?, ?, ?, ?)`,
    [render.id, render.artworkId, render.url, render.caption]
  );
}

export async function deleteRender(id: string, artworkId: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM renders WHERE id = ? AND artwork_id = ?',
    [id, artworkId]
  );
  return result.affectedRows > 0;
}
