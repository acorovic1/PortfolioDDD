import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
type TestUser = Awaited<ReturnType<typeof registerTestUser>>;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('creator analytics', () => {
  let creator: TestUser;
  let fan: TestUser;
  let artworkId: string;

  beforeAll(async () => {
    creator = await registerTestUser();
    fan = await registerTestUser();
    createdUserIds.push(creator.id, fan.id);
    artworkId = await createProcessedArtwork(creator.token, { title: 'Analytics piece' });

    await request(app).post(`/api/artworks/${artworkId}/view`).set(auth(fan.token)).send({ source: 'explore' });
    await request(app).post(`/api/artworks/${artworkId}/view`).send({ source: 'search' });
    await request(app).post(`/api/portfolio/artworks/${artworkId}/like`).set(auth(fan.token));
    await request(app).post(`/api/portfolio/artworks/${artworkId}/like`).set(auth(creator.token)); // own like: not counted
    await request(app).post(`/api/portfolio/artworks/${artworkId}/comments`).set(auth(fan.token)).send({ text: 'Nice' });
    await request(app).post(`/api/users/${creator.username}/follow`).set(auth(fan.token));

    // An older view, in the previous 7-day period.
    await pool.query(
      `INSERT INTO artwork_views (artwork_id, viewer_key, view_date, source, created_at)
       VALUES ($1, 'old-viewer', CURRENT_DATE - 9, 'direct', NOW() - INTERVAL '9 days')`,
      [artworkId]
    );
  });

  it('summarizes the period, the previous period and the daily series', async () => {
    const res = await request(app).get('/api/analytics/me?days=7').set(auth(creator.token));
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ views: 2, likes: 1, comments: 1, followers: 1 });
    expect(res.body.previous.views).toBe(1);
    expect(res.body.daily).toHaveLength(7);
    expect(res.body.daily.at(-1)).toMatchObject({ views: 2, likes: 1, followers: 1 });
    expect(res.body.sources).toEqual(expect.arrayContaining([
      { source: 'explore', views: 1 },
      { source: 'search', views: 1 },
    ]));
    expect(res.body.topArtworks[0]).toMatchObject({ id: artworkId, views: 2, likes: 1, comments: 1 });
    expect(res.body.allTime).toMatchObject({ followers: 1, artworks: 1 });
  });

  it('defaults to 30 days and requires sign-in', async () => {
    const res = await request(app).get('/api/analytics/me?days=12').set(auth(creator.token));
    expect(res.body.days).toBe(30);
    expect(res.body.daily).toHaveLength(30);
    expect((await request(app).get('/api/analytics/me')).status).toBe(401);
  });
});
