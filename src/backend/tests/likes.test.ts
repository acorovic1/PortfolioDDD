import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
const fakeGlb = Buffer.from('glTF\x02\x00\x00\x00');

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('likes', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let liker: Awaited<ReturnType<typeof registerTestUser>>;
  let artworkId: string;

  beforeAll(async () => {
    owner = await registerTestUser();
    liker = await registerTestUser();
    createdUserIds.push(owner.id, liker.id);

    const artwork = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('title', 'Likeable Piece')
      .attach('model', fakeGlb, 'test.glb');
    artworkId = artwork.body.id;
  });

  it('starts with no likes', async () => {
    const res = await request(app)
      .get('/api/portfolio/likes')
      .set('Authorization', `Bearer ${liker.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('likes and unlikes an artwork idempotently', async () => {
    const like = await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/like`)
      .set('Authorization', `Bearer ${liker.token}`);
    expect(like.status).toBe(201);

    // Liking again should not error (INSERT IGNORE)
    const likeAgain = await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/like`)
      .set('Authorization', `Bearer ${liker.token}`);
    expect(likeAgain.status).toBe(201);

    const listed = await request(app)
      .get('/api/portfolio/likes')
      .set('Authorization', `Bearer ${liker.token}`);
    expect(listed.body).toEqual([artworkId]);

    const unlike = await request(app)
      .delete(`/api/portfolio/artworks/${artworkId}/like`)
      .set('Authorization', `Bearer ${liker.token}`);
    expect(unlike.status).toBe(200);

    const listedAfter = await request(app)
      .get('/api/portfolio/likes')
      .set('Authorization', `Bearer ${liker.token}`);
    expect(listedAfter.body).toEqual([]);
  });

  it('rejects liking a nonexistent artwork', async () => {
    const res = await request(app)
      .post('/api/portfolio/artworks/00000000-0000-0000-0000-000000000000/like')
      .set('Authorization', `Bearer ${liker.token}`);
    expect(res.status).toBe(404);
  });
});
