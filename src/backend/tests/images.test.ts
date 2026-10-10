import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { app } from '../app.ts';

describe('responsive images', () => {
  const name = `${crypto.randomUUID()}.png`;
  const src = `/uploads/renders/${name}`;

  beforeAll(async () => {
    await mkdir(path.join('uploads', 'renders'), { recursive: true });
    const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#3366cc' } }).png().toBuffer();
    await writeFile(path.join('uploads', 'renders', name), png);
  });

  it('serves a cached, immutable WebP at the requested width', async () => {
    const res = await request(app).get('/img').query({ src, w: 640 }).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('immutable');
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(360);

    // Second request comes from the cache.
    expect((await request(app).get('/img').query({ src, w: 640 })).status).toBe(200);
  });

  it("never enlarges past the original's size", async () => {
    const res = await request(app).get('/img').query({ src, w: 1920 }).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect((await sharp(res.body as Buffer).metadata()).width).toBe(1600);
  });

  it('only resizes stored images, at the allowed widths', async () => {
    expect((await request(app).get('/img').query({ src, w: 500 })).status).toBe(400);
    expect((await request(app).get('/img').query({ src: '/uploads/models/x.glb', w: 640 })).status).toBe(400);
    expect((await request(app).get('/img').query({ src: '/uploads/../package.json', w: 640 })).status).toBe(400);
    expect((await request(app).get('/img').query({ src: 'https://example.com/a.png', w: 640 })).status).toBe(400);
    expect((await request(app).get('/img').query({ src: '/uploads/renders/missing.png', w: 640 })).status).toBe(404);
  });
});
