import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { waitForModelJobs } from '../pipeline/processor.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

const MB = 1024 * 1024;
const image = (width = 300, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: '#7d5d93' } }).png().toBuffer();
const localFile = (url: string) => path.join(process.cwd(), url.replace(/^\//, ''));

async function newUser() {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const storage = async (token: string) =>
  (await request(app).get('/api/users/me/storage').set('Authorization', `Bearer ${token}`)).body as { usedBytes: number; quotaBytes: number };

const setQuota = (userId: string, bytes: number) =>
  pool.query('UPDATE users SET storage_quota_bytes = $1 WHERE id = $2', [bytes, userId]);

const uploadImage = async (token: string, file?: Buffer) =>
  request(app).post('/api/portfolio/artworks/image').set('Authorization', `Bearer ${token}`)
    .field('title', 'Quota test').attach('image', file ?? await image(), 'painting.png');

const uploadAvatar = async (token: string, file?: Buffer) =>
  request(app).post('/api/users/me/avatar').set('Authorization', `Bearer ${token}`)
    .attach('avatar', file ?? await image(64, 64), 'avatar.png');

describe('storage quota', () => {
  it('starts at the default quota, counts uploads and frees them on delete', async () => {
    const user = await newUser();
    expect(await storage(user.token)).toEqual({ usedBytes: 0, quotaBytes: 250 * MB });

    const res = await uploadImage(user.token);
    expect(res.status).toBe(201);
    const used = (await storage(user.token)).usedBytes;
    // The image plus its generated thumbnail.
    expect(used).toBeGreaterThan((await image()).length);

    await request(app).delete(`/api/portfolio/artworks/${res.body.id}`).set('Authorization', `Bearer ${user.token}`);
    expect((await storage(user.token)).usedBytes).toBe(0);
  });

  it('turns away an upload that would go over the quota, keeping nothing of it', async () => {
    const user = await newUser();
    await setQuota(user.id, 1000);

    const res = await uploadImage(user.token);
    expect(res.status).toBe(413);
    expect(res.body.storageQuotaExceeded).toBe(true);
    expect(res.body.quotaBytes).toBe(1000);
    expect((await storage(user.token)).usedBytes).toBe(0);
    const own = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${user.token}`);
    expect(own.body).toHaveLength(0);
  });

  it('turns away any upload once the account is full', async () => {
    const user = await newUser();
    expect((await uploadAvatar(user.token)).status).toBe(200);
    await setQuota(user.id, (await storage(user.token)).usedBytes);

    const res = await uploadImage(user.token);
    expect(res.status).toBe(413);
    expect(res.body.storageQuotaExceeded).toBe(true);
  });

  it('lets only as many simultaneous uploads through as fit', async () => {
    const user = await newUser();
    const file = await image();
    // Room for one image (and its small thumbnail), not two.
    await setQuota(user.id, Math.floor(file.length * 1.5));

    const results = await Promise.all(Array.from({ length: 5 }, () => uploadImage(user.token, file)));
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 413)).toHaveLength(4);

    const { usedBytes, quotaBytes } = await storage(user.token);
    expect(usedBytes).toBeLessThanOrEqual(quotaBytes);
    // Nothing is left reserved once the uploads are done.
    const reserved = await pool.query('SELECT 1 FROM storage_reservations WHERE user_id = $1', [user.id]);
    expect(reserved.rowCount).toBe(0);
  });

  it("holds a model upload's space until it has been processed", async () => {
    const user = await newUser();
    const stl = Buffer.from(
      'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t'
    );
    const res = await request(app).post('/api/portfolio/artworks').set('Authorization', `Bearer ${user.token}`)
      .field('title', 'Triangle').attach('model', stl, 'model.stl');
    expect(res.status).toBe(201);
    await waitForModelJobs();

    const reserved = await pool.query('SELECT 1 FROM storage_reservations WHERE user_id = $1', [user.id]);
    expect(reserved.rowCount).toBe(0);
    // The processed GLB is what counts.
    expect((await storage(user.token)).usedBytes).toBeGreaterThan(0);
  });

  it('credits the file an upload replaces, and deletes it', async () => {
    const user = await newUser();
    const first = await uploadAvatar(user.token);
    expect(first.status).toBe(200);
    const firstSize = (await storage(user.token)).usedBytes;
    // Room for one avatar, not two.
    await setQuota(user.id, firstSize + 100);

    const second = await uploadAvatar(user.token);
    expect(second.status).toBe(200);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
    expect(existsSync(localFile(first.body.avatarUrl))).toBe(false);
    expect((await storage(user.token)).usedBytes).toBe(firstSize);
  });

  it('caps the size of each kind of file', async () => {
    const user = await newUser();
    const tooBigImage = Buffer.alloc(5 * MB + 1);

    const avatar = await uploadAvatar(user.token, tooBigImage);
    expect(avatar.status).toBe(413);
    const cover = await request(app).post('/api/users/me/cover').set('Authorization', `Bearer ${user.token}`)
      .attach('cover', tooBigImage, 'cover.png');
    expect(cover.status).toBe(413);

    const artwork = await uploadImage(user.token, Buffer.alloc(10 * MB + 1));
    expect(artwork.status).toBe(413);

    const model = await request(app).post('/api/portfolio/artworks').set('Authorization', `Bearer ${user.token}`)
      .field('title', 'Too big').attach('model', Buffer.alloc(50 * MB + 1), 'model.stl');
    expect(model.status).toBe(413);

    expect((await storage(user.token)).usedBytes).toBe(0);
  });
});
