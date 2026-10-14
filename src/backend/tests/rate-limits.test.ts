import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { imageResizeRateLimiter } from '../middleware/rate-limit.middleware.ts';

// Rate limits are off under test (NODE_ENV=test); these turn them on.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('new image variants rate limit', () => {
  it('limits resizes, but never variants that are already cached', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const app = express();
    app.get('/img', imageResizeRateLimiter, (_req, res) => { res.send('resized'); });

    // A variant in the shared cache.
    const cachedSrc = `/uploads/renders/${crypto.randomUUID()}.png`;
    const cacheFile = path.join('uploads', 'cache', 'img', `${crypto.createHash('sha256').update(cachedSrc).digest('hex').slice(0, 32)}-320.webp`);
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, 'cached');

    try {
      const fresh = () => request(app).get('/img').query({ src: `/uploads/renders/${crypto.randomUUID()}.png`, w: 320 });
      for (let i = 0; i < 500; i++) {
        expect((await fresh()).status).toBe(200);
      }
      expect((await fresh()).status).toBe(429);

      const cached = await request(app).get('/img').query({ src: cachedSrc, w: 320 });
      expect(cached.status).toBe(200);
    } finally {
      await rm(cacheFile, { force: true });
    }
  }, 30_000);
});

describe('TRUST_PROXY', () => {
  it('trusts that many proxies in front, and none by default', async () => {
    vi.resetModules();
    const plain = await import('../app.ts');
    expect(plain.app.get('trust proxy')).toBe(false);

    vi.stubEnv('TRUST_PROXY', '1');
    vi.resetModules();
    const proxied = await import('../app.ts');
    expect(proxied.app.get('trust proxy')).toBe(1);
  });
});
