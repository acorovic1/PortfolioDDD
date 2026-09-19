import { pool } from '../config/db.ts';
import type { CommentRecord, CommentDTO } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export function toCommentDTO(row: CommentRecord): CommentDTO {
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    postedAt: row.created_at,
    artworkId: row.artwork_id,
  };
}

export async function findCommentsByArtworkId(artworkId: string): Promise<CommentRecord[]> {
  const [rows] = await pool.query<(CommentRecord & RowDataPacket)[]>(
    `SELECT comments.*, users.username AS author
     FROM comments
     JOIN users ON users.id = comments.user_id
     WHERE comments.artwork_id = ?
     ORDER BY comments.created_at ASC`,
    [artworkId]
  );
  return rows;
}

export async function findCommentById(id: string): Promise<CommentRecord | null> {
  const [rows] = await pool.query<(CommentRecord & RowDataPacket)[]>(
    `SELECT comments.*, users.username AS author
     FROM comments
     JOIN users ON users.id = comments.user_id
     WHERE comments.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createComment(comment: {
  id: string;
  artworkId: string;
  userId: string;
  text: string;
}): Promise<void> {
  await pool.query<ResultSetHeader>(
    'INSERT INTO comments (id, artwork_id, user_id, text) VALUES (?, ?, ?, ?)',
    [comment.id, comment.artworkId, comment.userId, comment.text]
  );
}

export async function deleteComment(id: string): Promise<void> {
  await pool.query('DELETE FROM comments WHERE id = ?', [id]);
}
