import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

// A processed (viewable) artwork: others can only like/comment on those.
async function createArtwork(token: string, title = 'Test Piece') {
  const id = await createProcessedArtwork(token, { title });
  const res = await request(app)
    .get(`/api/portfolio/artworks/${id}/status`)
    .set('Authorization', `Bearer ${token}`);
  return res.body;
}

describe('artwork ownership', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let stranger: Awaited<ReturnType<typeof registerTestUser>>;

  beforeAll(async () => {
    owner = await registerTestUser();
    stranger = await registerTestUser();
    createdUserIds.push(owner.id, stranger.id);
  });

  it('rejects a non-owner updating or deleting an artwork', async () => {
    const artwork = await createArtwork(owner.token);

    const update = await request(app)
      .put(`/api/portfolio/artworks/${artwork.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ title: 'Hijacked' });
    expect(update.status).toBe(404);

    const del = await request(app)
      .delete(`/api/portfolio/artworks/${artwork.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(del.status).toBe(404);
  });

  it('lets the owner update and delete their own artwork', async () => {
    const artwork = await createArtwork(owner.token);

    const update = await request(app)
      .put(`/api/portfolio/artworks/${artwork.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Renamed' });
    expect(update.status).toBe(200);
    expect(update.body.title).toBe('Renamed');

    const del = await request(app)
      .delete(`/api/portfolio/artworks/${artwork.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(del.status).toBe(200);
  });

  it('rejects uploading a non-model file', async () => {
    const res = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('title', 'Bad upload')
      .attach('model', Buffer.from('not a model'), 'notes.txt');

    expect(res.status).toBe(400);
  });
});

describe('comment moderation', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let commenter: Awaited<ReturnType<typeof registerTestUser>>;
  let stranger: Awaited<ReturnType<typeof registerTestUser>>;
  let artworkId: string;

  beforeAll(async () => {
    owner = await registerTestUser();
    commenter = await registerTestUser();
    stranger = await registerTestUser();
    createdUserIds.push(owner.id, commenter.id, stranger.id);

    const artwork = await createArtwork(owner.token, 'Commentable Piece');
    artworkId = artwork.id;
  });

  it('is publicly listable without auth', async () => {
    const res = await request(app).get(`/api/portfolio/artworks/${artworkId}/comments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lets the artwork owner delete someone else\'s comment', async () => {
    const commentRes = await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Nice work!' });
    expect(commentRes.status).toBe(201);

    const del = await request(app)
      .delete(`/api/portfolio/artworks/${artworkId}/comments/${commentRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(del.status).toBe(200);
  });

  it('rejects a stranger deleting someone else\'s comment', async () => {
    const commentRes = await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ text: 'Another comment' });

    const del = await request(app)
      .delete(`/api/portfolio/artworks/${artworkId}/comments/${commentRes.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(del.status).toBe(403);
  });
});

describe('GET /api/portfolio/artworks/batch', () => {
  it("leaves out other people's drafts, scheduled and private artworks", async () => {
    const owner = await registerTestUser();
    const other = await registerTestUser();
    createdUserIds.push(owner.id, other.id);

    const published = await createProcessedArtwork(owner.token);
    const unlisted = await createProcessedArtwork(owner.token, { visibility: 'unlisted' });
    const draft = await createProcessedArtwork(owner.token, { draft: 'true' });
    const priv = await createProcessedArtwork(owner.token, { visibility: 'private' });
    const scheduled = await createProcessedArtwork(owner.token, {
      publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const all = [published, unlisted, draft, priv, scheduled];
    const url = `/api/portfolio/artworks/batch?ids=${all.join(',')}`;
    const ids = (body: { id: string }[]) => body.map(a => a.id).sort();

    // Anonymous and other users: only what they could open anyway (unlisted
    // artworks open by link).
    const anonymous = await request(app).get(url);
    expect(anonymous.status).toBe(200);
    expect(ids(anonymous.body)).toEqual([published, unlisted].sort());

    const asOther = await request(app).get(url).set('Authorization', `Bearer ${other.token}`);
    expect(ids(asOther.body)).toEqual([published, unlisted].sort());

    // The owner still sees all of their own.
    const asOwner = await request(app).get(url).set('Authorization', `Bearer ${owner.token}`);
    expect(ids(asOwner.body)).toEqual(all.sort());
  });
});
