import type { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.ts';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const cache = new Map<string, { optedOut: boolean; expires: number }>();

// Whether the stored file at this URL (/uploads path or bucket URL) belongs
// to a user who opted out of AI training (models, thumbnails, renders,
// avatars and covers are checked).
export async function noAiForUrl(publicPath: string): Promise<boolean> {
  const cached = cache.get(publicPath);
  if (cached && cached.expires > Date.now()) return cached.optedOut;

  const { rows } = await pool.query<{ no_ai_training: boolean }>(
    `SELECT u.no_ai_training FROM users u
     WHERE u.avatar_url = $1 OR u.cover_url = $1
        OR u.id IN (SELECT a.user_id FROM artworks a WHERE a.model_path = $1 OR a.thumbnail_path = $1)
        OR u.id IN (SELECT a.user_id FROM renders r JOIN artworks a ON a.id = r.artwork_id WHERE r.url = $1)
     LIMIT 1`,
    [publicPath]
  );
  const optedOut = rows[0]?.no_ai_training ?? false;

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(publicPath, { optedOut, expires: Date.now() + CACHE_TTL_MS });
  return optedOut;
}

// Adds `X-Robots-Tag: noai, noimageai` to uploads of NoAI creators - the
// de-facto signal (also used by ArtStation/DeviantArt) asking crawlers not
// to use the file for AI training. It's advisory: compliant crawlers honor it.
export function noAiHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }

  noAiForUrl(`/uploads${req.path}`)
    .then(optedOut => {
      if (optedOut) res.setHeader('X-Robots-Tag', 'noai, noimageai');
    })
    .catch(() => {
      // Never block serving a file over a lookup failure.
    })
    .finally(() => next());
}

export function clearNoAiCache(): void {
  cache.clear();
}
