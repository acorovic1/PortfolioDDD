import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waitForModelJobs } from '../pipeline/processor.ts';
import sharp from 'sharp';

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

  it('finds artworks by the software used and by tags, in part', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    // Unique words, so other test data can't match.
    const id = crypto.randomUUID().slice(0, 8);
    const tool = `Sculptron${id}`;
    const tag = `wyvern${id}`;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).png().toBuffer();
    const created = await request(app)
      .post('/api/portfolio/artworks/image')
      .set('Authorization', `Bearer ${user.token}`)
      .field('title', 'Untitled study')
      .field('tools', `Blender, ${tool}`)
      .attach('image', png, 'study.png');
    await request(app)
      .put(`/api/portfolio/artworks/${created.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ tags: [tag] });

    const search = (q: string) => request(app)
      .get(`/api/artworks/search?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${user.token}`);

    const byTool = await search(tool.slice(0, -2).toLowerCase());
    expect(byTool.body.artworks.map((a: { id: string }) => a.id)).toContain(created.body.id);
    const byTag = await search(`ern${id}`);
    expect(byTag.body.artworks.map((a: { id: string }) => a.id)).toContain(created.body.id);
    // LIKE wildcards are searched for literally, not as "anything".
    const wildcard = await search(`%%${id}_`);
    expect(wildcard.body.artworks).toEqual([]);

    // Explore's full results match the same way.
    const feed = await request(app).get(`/api/feed?tab=recent&q=${encodeURIComponent(tool.toLowerCase())}`);
    expect(feed.body.artworks.map((a: { id: string }) => a.id)).toEqual([created.body.id]);
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
