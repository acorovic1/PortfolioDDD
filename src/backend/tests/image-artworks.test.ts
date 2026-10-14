import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

// A 300 x 400 px image (portrait, like most paintings).
const painting = () => sharp({ create: { width: 300, height: 400, channels: 3, background: '#7d5d93' } }).png().toBuffer();

async function uploadImage(token: string, fields: Record<string, string> = {}, file?: Buffer, name = 'painting.png') {
  let req = request(app).post('/api/portfolio/artworks/image').set('Authorization', `Bearer ${token}`).field('title', 'Lantern Ridge');
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req.attach('image', file ?? await painting(), name);
}

const localFile = (url: string) => path.join(process.cwd(), url.replace(/^\//, ''));

describe('2D artworks', () => {
  it('stores the image with its size, a thumbnail and the canvas settings', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await uploadImage(user.token, { edge: 'white', medium: 'oil' });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('image');
    expect(res.body.processingStatus).toBe('ready');
    expect(res.body.modelUrl).toBe('');
    expect(res.body.imageUrl).toMatch(/^\/uploads\/images\/[\w-]+\.png$/);
    expect(res.body.imageWidth).toBe(300);
    expect(res.body.imageHeight).toBe(400);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\/thumbnails\/[\w-]+\.webp$/);
    expect(res.body.canvas).toEqual({ edge: 'white', medium: 'oil' });
    expect(existsSync(localFile(res.body.imageUrl))).toBe(true);
    expect(existsSync(localFile(res.body.thumbnailUrl))).toBe(true);

    // Listed right away: it has nothing to process.
    const own = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${user.token}`);
    expect(own.body.map((a: { id: string }) => a.id)).toContain(res.body.id);
    const batch = await request(app).get(`/api/portfolio/artworks/batch?ids=${res.body.id}`);
    expect(batch.body).toHaveLength(1);
  });

  it('defaults to black edges and no medium', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await uploadImage(user.token);
    expect(res.status).toBe(201);
    expect(res.body.canvas).toEqual({ edge: 'black', medium: null });
  });

  it('respects the publishing choice', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const draft = await uploadImage(user.token, { draft: 'true' });
    expect(draft.body.publishedAt).toBeNull();
    // Someone else can't open a draft.
    const batch = await request(app).get(`/api/portfolio/artworks/batch?ids=${draft.body.id}`);
    expect(batch.body).toHaveLength(0);
  });

  it('rejects files that are not readable images', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const notImage = await uploadImage(user.token, {}, Buffer.from('not really a png'));
    expect(notImage.status).toBe(400);

    // Mirrored edges were dropped: only painted ones.
    const wrongEdge = await uploadImage(user.token, { edge: 'mirror' });
    expect(wrongEdge.status).toBe(400);
  });

  it('updates the canvas settings, but has no model to replace', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const created = await uploadImage(user.token);
    const id = created.body.id;

    const canvas = { edge: 'white', medium: 'acrylic' };
    const updated = await request(app).put(`/api/portfolio/artworks/${id}`).set('Authorization', `Bearer ${user.token}`).send({ canvas });
    expect(updated.status).toBe(200);
    expect(updated.body.canvas).toEqual(canvas);

    const invalid = await request(app).put(`/api/portfolio/artworks/${id}`).set('Authorization', `Bearer ${user.token}`)
      .send({ canvas: { ...canvas, edge: 'gold' } });
    expect(invalid.status).toBe(400);

    const replace = await request(app).put(`/api/portfolio/artworks/${id}/model`).set('Authorization', `Bearer ${user.token}`)
      .attach('model', Buffer.from('{}'), 'model.gltf');
    expect(replace.status).toBe(400);
  });

  it('deletes the image and its thumbnail with the artwork', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const created = await uploadImage(user.token);

    const res = await request(app).delete(`/api/portfolio/artworks/${created.body.id}`).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(existsSync(localFile(created.body.imageUrl))).toBe(false);
    expect(existsSync(localFile(created.body.thumbnailUrl))).toBe(false);
  });

  it('serves resized variants of the image', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const created = await uploadImage(user.token);

    const res = await request(app).get(`/img?src=${encodeURIComponent(created.body.imageUrl)}&w=160`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
  });
});
