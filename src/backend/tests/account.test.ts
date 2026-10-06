import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waitForModelJobs } from '../pipeline/processor.ts';

const createdUserIds: string[] = [];
const fakeGlb = Buffer.from('glTF\x02\x00\x00\x00');

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('account deletion', () => {
  it('rejects deletion with the wrong password', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('deletes the account, its artworks, and logs it out of future requests', async () => {
    const user = await registerTestUser();

    const artwork = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${user.token}`)
      .field('title', 'Doomed Piece')
      .attach('model', fakeGlb, 'test.glb');
    expect(artwork.status).toBe(201);

    const del = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: user.password });
    expect(del.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);
    expect(me.status).toBe(404);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(login.status).toBe(401);
  });
});

describe('artwork search', () => {
  it('finds artworks by title across users', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const uniqueTitle = `Zorbthing_${crypto.randomUUID().slice(0, 8)}`;
    // Only artworks with a processed model are searchable, so this needs a
    // real (convertible) model rather than the fake GLB.
    await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${user.token}`)
      .field('title', uniqueTitle)
      .field('category', 'Sculpture')
      .attach('model', readFileSync(path.join(process.cwd(), 'e2e', 'fixtures', 'blue-triangle.gltf')), 'test.gltf');
    await waitForModelJobs();

    const res = await request(app)
      .get(`/api/artworks/search?q=${uniqueTitle}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.artworks).toHaveLength(1);
    expect(res.body.artworks[0]).toMatchObject({
      title: uniqueTitle,
      category: 'Sculpture',
      username: user.username,
    });
  });

  it('returns an empty list for a query under 2 characters', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await request(app)
      .get('/api/artworks/search?q=a')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.body.artworks).toEqual([]);
  });
});
