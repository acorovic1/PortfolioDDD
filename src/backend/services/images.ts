import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { isStoredImageUrl, readStoredFile, IMMUTABLE_CACHE_CONTROL } from '../storage/storage.ts';
import { noAiForUrl } from '../middleware/noai.middleware.ts';

// On-demand responsive images: GET /img?src=<stored image URL>&w=<width>
// returns a WebP no wider than `w`. Results are cached on disk and served as
// immutable (sources never change - their names are random UUIDs), so a CDN
// in front of the site caches them too. Works for every image ever
// uploaded, with no backfill.

export const IMAGE_WIDTHS = [96, 160, 320, 480, 640, 960, 1280, 1920] as const;

const CACHE_DIR = path.join('uploads', 'cache', 'img');
const inFlight = new Map<string, Promise<Buffer>>();

async function resized(src: string, width: number): Promise<Buffer> {
  const name = `${crypto.createHash('sha256').update(src).digest('hex').slice(0, 32)}-${width}.webp`;
  const cached = path.join(CACHE_DIR, name);
  try {
    return await readFile(cached);
  } catch {
    // not cached yet
  }

  // Concurrent requests for the same variant share one resize.
  let job = inFlight.get(name);
  if (!job) {
    job = (async () => {
      const output = await sharp(await readStoredFile(src))
        .rotate() // respect EXIF orientation
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cached, output);
      return output;
    })().finally(() => inFlight.delete(name));
    inFlight.set(name, job);
  }
  return job;
}

export async function resizeImage(req: Request, res: Response): Promise<void> {
  const src = typeof req.query.src === 'string' ? req.query.src : '';
  const width = Number(req.query.w);

  if (!isStoredImageUrl(src) || !(IMAGE_WIDTHS as readonly number[]).includes(width)) {
    res.status(400).json({ error: `src must be a stored image and w one of ${IMAGE_WIDTHS.join(', ')}` });
    return;
  }

  try {
    const image = await resized(src, width);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    if (await noAiForUrl(src)) res.setHeader('X-Robots-Tag', 'noai, noimageai');
    res.send(image);
  } catch {
    res.status(404).json({ error: 'Image not found' });
  }
}
