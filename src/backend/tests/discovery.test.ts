import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';
import { announceNewlyPublished } from '../services/publisher.ts';
import { normalizeTags } from '../controllers/portfolio.controller.ts';

const createdUserIds: string[] = [];
type TestUser = Awaited<ReturnType<typeof registerTestUser>>;

async function newUser(): Promise<TestUser> {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const feed = (query: string, token?: string) => {
  const req = request(app).get(`/api/feed?${query}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const feedIds = (res: request.Response) => res.body.artworks.map((a: { id: string }) => a.id);

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('tags', () => {
  it('normalizes tags for exact, case-insensitive filtering', () => {
    expect(normalizeTags(['Hard Surface', '#SciFi', 'sci-fi', 'scifi', ' ', 'a/b'])).toEqual(['hard-surface', 'scifi', 'sci-fi', 'ab']);
  });
});

describe('follows', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await newUser();
    bob = await newUser();
  });

  it('follows, notifies, counts and unfollows', async () => {
    const follow = await request(app)
      .post(`/api/users/${bob.username}/follow`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(follow.status).toBe(201);
    expect(follow.body).toMatchObject({ isFollowing: true, followers: 1 });

    // Following twice is a no-op.
    const again = await request(app)
      .post(`/api/users/${bob.username}/follow`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(again.status).toBe(200);

    const notifications = await request(app).get('/api/notifications').set('Authorization', `Bearer ${bob.token}`);
    const follows = notifications.body.notifications.filter((n: { type: string }) => n.type === 'follow');
    expect(follows).toHaveLength(1);

    const profile = await request(app)
      .get(`/api/users/${bob.username}/portfolio?all=true`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(profile.body.stats.followers).toBe(1);
    expect(profile.body.viewer.isFollowing).toBe(true);

    const followers = await request(app).get(`/api/users/${bob.username}/followers`);
    expect(followers.body.users.map((u: { username: string }) => u.username)).toEqual([alice.username]);

    const unfollow = await request(app)
      .delete(`/api/users/${bob.username}/follow`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(unfollow.body).toMatchObject({ isFollowing: false, followers: 0 });
  });

  it("doesn't allow following yourself", async () => {
    const res = await request(app)
      .post(`/api/users/${alice.username}/follow`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(400);
  });
});

describe('feeds and publishing', () => {
  let creator: TestUser;
  let fan: TestUser;
  let stranger: TestUser;
  let published: string;
  let draft: string;
  let scheduled: string;
  let privateId: string;
  let unlisted: string;
  const tag = `tag${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    creator = await newUser();
    fan = await newUser();
    stranger = await newUser();

    await request(app).post(`/api/users/${creator.username}/follow`).set('Authorization', `Bearer ${fan.token}`);

    published = await createProcessedArtwork(creator.token, { tags: [tag, 'Hard Surface'], tools: ['Blender', 'ZBrush'], category: 'Prop' });
    draft = await createProcessedArtwork(creator.token, { tags: [tag], publishedAt: null });
    scheduled = await createProcessedArtwork(creator.token, { tags: [tag], publishedAt: new Date(Date.now() + 86_400_000).toISOString() });
    privateId = await createProcessedArtwork(creator.token, { tags: [tag], visibility: 'private' });
    unlisted = await createProcessedArtwork(creator.token, { tags: [tag], visibility: 'unlisted' });
  });

  it('lists only published public artworks in feeds', async () => {
    const res = await feed(`tab=latest&tag=${tag}`);
    expect(res.status).toBe(200);
    expect(feedIds(res)).toEqual([published]);
    expect(res.body.artworks[0]).toMatchObject({ username: creator.username, tags: [tag, 'hard-surface'] });
  });

  it('filters by tag (case-insensitive), tool and category', async () => {
    expect(feedIds(await feed(`tab=latest&tag=${tag.toUpperCase()}`))).toEqual([published]);
    expect(feedIds(await feed(`tab=latest&tag=${tag}&tool=zbrush`))).toEqual([published]);
    expect(feedIds(await feed(`tab=latest&tag=${tag}&tool=maya`))).toEqual([]);
    expect(feedIds(await feed(`tab=latest&tag=${tag}&category=prop`))).toEqual([published]);
  });

  it('shows the following feed only to followers, and requires sign-in', async () => {
    expect((await feed('tab=following')).status).toBe(401);
    expect(feedIds(await feed('tab=following', fan.token))).toContain(published);
    expect(feedIds(await feed('tab=following', stranger.token))).not.toContain(published);
  });

  it('keeps drafts, scheduled and private artworks off the public profile but reachable for unlisted links', async () => {
    const profile = await request(app).get(`/api/users/${creator.username}/portfolio?all=true`);
    const ids = profile.body.artworks.map((a: { id: string }) => a.id);
    expect(ids).toContain(published);
    for (const hidden of [draft, scheduled, privateId, unlisted]) expect(ids).not.toContain(hidden);

    const linked = await request(app).get(`/api/users/${creator.username}/portfolio?all=true&artwork=${unlisted}`);
    expect(linked.body.artworks.map((a: { id: string }) => a.id)).toContain(unlisted);

    const privateLink = await request(app).get(`/api/users/${creator.username}/portfolio?all=true&artwork=${privateId}`);
    expect(privateLink.body.artworks.map((a: { id: string }) => a.id)).not.toContain(privateId);

    // The owner still sees everything in their own portfolio.
    const own = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${creator.token}`);
    expect(own.body.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining([published, draft, scheduled, privateId, unlisted]));
  });

  it("blocks likes and comments on artworks the caller can't see", async () => {
    const like = await request(app).post(`/api/portfolio/artworks/${privateId}/like`).set('Authorization', `Bearer ${fan.token}`);
    expect(like.status).toBe(404);
    const comment = await request(app)
      .post(`/api/portfolio/artworks/${draft}/comments`)
      .set('Authorization', `Bearer ${fan.token}`)
      .send({ text: 'sneaky' });
    expect(comment.status).toBe(404);
  });

  it('announces newly published artworks to followers exactly once', async () => {
    await announceNewlyPublished();
    const countAnnouncements = async (artworkId: string) => {
      const res = await request(app).get('/api/notifications?limit=50').set('Authorization', `Bearer ${fan.token}`);
      return res.body.notifications.filter((n: { type: string; artworkId: string }) => n.type === 'new_artwork' && n.artworkId === artworkId).length;
    };
    expect(await countAnnouncements(published)).toBe(1);

    // An upload saved as a draft isn't announced until it's published.
    const savedDraft = await createProcessedArtwork(creator.token, { draft: 'true' });
    await announceNewlyPublished();
    expect(await countAnnouncements(savedDraft)).toBe(0);

    await request(app)
      .put(`/api/portfolio/artworks/${savedDraft}`)
      .set('Authorization', `Bearer ${creator.token}`)
      .send({ publishedAt: new Date().toISOString() });
    await announceNewlyPublished();
    await announceNewlyPublished();
    expect(await countAnnouncements(savedDraft)).toBe(1);
  });

  it('counts one view per viewer per day and ignores the owner', async () => {
    const view = (token?: string) => {
      const req = request(app).post(`/api/artworks/${published}/view`).send({ source: 'explore' });
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    expect((await view(fan.token)).body.counted).toBe(true);
    expect((await view(fan.token)).body.counted).toBe(false);
    expect((await view(creator.token)).body.counted).toBe(false);
    expect((await view()).body.counted).toBe(true);

    const { rows } = await pool.query('SELECT view_count FROM artworks WHERE id = $1', [published]);
    expect(rows[0].view_count).toBe(2);

    expect((await request(app).post(`/api/artworks/${privateId}/view`)).status).toBe(404);
  });

  it('hides AI-generated work for viewers who opt out', async () => {
    const aiTag = `ai${crypto.randomUUID().slice(0, 8)}`;
    const aiArtwork = await createProcessedArtwork(creator.token, { tags: [aiTag], aiGenerated: true });

    expect(feedIds(await feed(`tab=latest&tag=${aiTag}`, fan.token))).toEqual([aiArtwork]);
    await request(app).put('/api/users/me').set('Authorization', `Bearer ${fan.token}`).send({ hideAi: true });
    expect(feedIds(await feed(`tab=latest&tag=${aiTag}`, fan.token))).toEqual([]);
  });

  it('ranks recently engaged artworks higher in trending', async () => {
    const trendTag = `trend${crypto.randomUUID().slice(0, 8)}`;
    const quiet = await createProcessedArtwork(creator.token, { tags: [trendTag] });
    const popular = await createProcessedArtwork(creator.token, { tags: [trendTag] });
    // `quiet` is newer, so it'd win on "latest".
    await pool.query("UPDATE artworks SET published_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [popular]);

    for (const user of [fan, stranger]) {
      await request(app).post(`/api/portfolio/artworks/${popular}/like`).set('Authorization', `Bearer ${user.token}`);
    }

    expect(feedIds(await feed(`tab=latest&tag=${trendTag}`))).toEqual([quiet, popular]);
    expect(feedIds(await feed(`tab=trending&tag=${trendTag}`))).toEqual([popular, quiet]);
  });

  it('returns filter facets from listed artworks', async () => {
    const res = await request(app).get('/api/feed/facets');
    expect(res.status).toBe(200);
    expect(res.body.tags.map((t: { name: string }) => t.name)).toContain(tag);
    expect(res.body.tools.map((t: { name: string }) => t.name.toLowerCase())).toContain('zbrush');
  });

  it('paginates with hasMore', async () => {
    const pageTag = `page${crypto.randomUUID().slice(0, 8)}`;
    await createProcessedArtwork(creator.token, { tags: [pageTag] });
    await createProcessedArtwork(creator.token, { tags: [pageTag] });

    const first = await feed(`tab=latest&limit=1&tag=${pageTag}`);
    expect(first.body.artworks).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    const second = await feed(`tab=latest&limit=1&offset=1&tag=${pageTag}`);
    expect(second.body.hasMore).toBe(false);
    expect(feedIds(second)).not.toEqual(feedIds(first));
  });
});

describe('NoAI opt-out', () => {
  it("marks a NoAI creator's uploads with X-Robots-Tag: noai", async () => {
    const creator = await newUser();
    const artworkId = await createProcessedArtwork(creator.token);
    const status = await request(app).get(`/api/portfolio/artworks/${artworkId}/status`).set('Authorization', `Bearer ${creator.token}`);
    const modelUrl = status.body.modelUrl as string;

    expect((await request(app).get(modelUrl)).headers['x-robots-tag']).toBeUndefined();

    await request(app).put('/api/users/me').set('Authorization', `Bearer ${creator.token}`).send({ noAiTraining: true });
    const res = await request(app).get(modelUrl);
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noai, noimageai');

    const summary = await request(app).get(`/api/users/${creator.username}/summary`);
    expect(summary.body.noAiTraining).toBe(true);
  });
});
