import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
type TestUser = Awaited<ReturnType<typeof registerTestUser>>;

async function newUser(): Promise<TestUser> {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

async function makeAdmin(user: TestUser): Promise<void> {
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('blocking', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceArtwork: string;
  const tag = `block${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    alice = await newUser();
    bob = await newUser();
    aliceArtwork = await createProcessedArtwork(alice.token, { tags: [tag] });
    await request(app).post(`/api/users/${alice.username}/follow`).set(auth(bob.token));
    await request(app)
      .post(`/api/portfolio/artworks/${aliceArtwork}/comments`)
      .set(auth(bob.token))
      .send({ text: 'before the block' });
  });

  it('cuts follows and stops interaction both ways', async () => {
    const block = await request(app).post(`/api/users/${bob.username}/block`).set(auth(alice.token));
    expect(block.body.hasBlocked).toBe(true);

    const summary = await request(app).get(`/api/users/${alice.username}/summary`);
    expect(summary.body.stats.followers).toBe(0);

    expect((await request(app).post(`/api/users/${alice.username}/follow`).set(auth(bob.token))).status).toBe(403);
    expect((await request(app).post(`/api/portfolio/artworks/${aliceArtwork}/like`).set(auth(bob.token))).status).toBe(403);
    const comment = await request(app)
      .post(`/api/portfolio/artworks/${aliceArtwork}/comments`)
      .set(auth(bob.token))
      .send({ text: 'hello?' });
    expect(comment.status).toBe(403);
  });

  it("hides each other's profiles, feed items and comments", async () => {
    // Bob was blocked by Alice: her profile is gone for him.
    expect((await request(app).get(`/api/users/${alice.username}/portfolio?all=true`).set(auth(bob.token))).status).toBe(404);
    expect((await request(app).get(`/api/users/${alice.username}/summary`).set(auth(bob.token))).status).toBe(404);

    const feed = await request(app).get(`/api/feed?tab=latest&tag=${tag}`).set(auth(bob.token));
    expect(feed.body.artworks).toHaveLength(0);
    const anonymousFeed = await request(app).get(`/api/feed?tab=latest&tag=${tag}`);
    expect(anonymousFeed.body.artworks).toHaveLength(1);

    // Alice no longer sees Bob's earlier comment on her artwork.
    const comments = await request(app).get(`/api/portfolio/artworks/${aliceArtwork}/comments`).set(auth(alice.token));
    expect(comments.body.map((c: { text: string }) => c.text)).not.toContain('before the block');

    // Alice still sees Bob's profile, flagged as blocked by her.
    const bobSummary = await request(app).get(`/api/users/${bob.username}/summary`).set(auth(alice.token));
    expect(bobSummary.body.viewer.hasBlocked).toBe(true);

    const blocks = await request(app).get('/api/users/me/blocks').set(auth(alice.token));
    expect(blocks.body.users.map((u: { username: string }) => u.username)).toEqual([bob.username]);
  });

  it('unblocking restores access', async () => {
    await request(app).delete(`/api/users/${bob.username}/block`).set(auth(alice.token));
    expect((await request(app).get(`/api/users/${alice.username}/portfolio?all=true`).set(auth(bob.token))).status).toBe(200);
    expect((await request(app).post(`/api/portfolio/artworks/${aliceArtwork}/like`).set(auth(bob.token))).status).toBe(201);
  });
});

describe('reports and admin moderation', () => {
  let admin: TestUser;
  let author: TestUser;
  let reporter: TestUser;
  let other: TestUser;
  let artworkId: string;
  let commentId: string;

  beforeAll(async () => {
    admin = await newUser();
    author = await newUser();
    reporter = await newUser();
    other = await newUser();
    await makeAdmin(admin);
    artworkId = await createProcessedArtwork(author.token, { title: 'Questionable' });
    const comment = await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/comments`)
      .set(auth(author.token))
      .send({ text: 'buy cheap followers here' });
    commentId = comment.body.id;
  });

  const report = (token: string, body: object) => request(app).post('/api/reports').set(auth(token)).send(body);

  it('accepts reports once per person and rejects reporting yourself', async () => {
    const first = await report(reporter.token, { targetType: 'comment', targetId: commentId, reason: 'spam' });
    expect(first.status).toBe(201);
    const again = await report(reporter.token, { targetType: 'comment', targetId: commentId, reason: 'spam' });
    expect(again.body.alreadyReported).toBe(true);
    expect((await report(author.token, { targetType: 'comment', targetId: commentId, reason: 'spam' })).status).toBe(400);
    expect((await report(reporter.token, { targetType: 'comment', targetId: commentId, reason: 'nope' })).status).toBe(400);
  });

  it('keeps the moderation API to admins', async () => {
    expect((await request(app).get('/api/admin/reports').set(auth(reporter.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/reports').set(auth(admin.token))).status).toBe(200);
  });

  it('removes reported content, notifies author and every reporter, and closes all reports on it', async () => {
    await report(other.token, { targetType: 'comment', targetId: commentId, reason: 'spam', details: 'link spam' });

    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    const item = queue.body.reports.find((r: { targetId: string }) => r.targetId === commentId);
    expect(item).toMatchObject({ targetType: 'comment', targetSummary: 'buy cheap followers here', targetUsername: author.username, openReportsOnTarget: 2 });

    const resolve = await request(app)
      .post(`/api/admin/reports/${item.id}/resolve`)
      .set(auth(admin.token))
      .send({ action: 'remove_content' });
    expect(resolve.body.closedReports).toBe(2);

    const comments = await request(app).get(`/api/portfolio/artworks/${artworkId}/comments`);
    expect(comments.body.map((c: { id: string }) => c.id)).not.toContain(commentId);

    const authorNotes = await request(app).get('/api/notifications').set(auth(author.token));
    expect(authorNotes.body.notifications.some((n: { type: string }) => n.type === 'moderation')).toBe(true);
    for (const user of [reporter, other]) {
      const notes = await request(app).get('/api/notifications').set(auth(user.token));
      expect(notes.body.notifications.some((n: { type: string }) => n.type === 'report_update')).toBe(true);
    }

    const closed = await request(app).get('/api/admin/reports?status=closed').set(auth(admin.token));
    const closedItem = closed.body.reports.find((r: { id: string }) => r.id === item.id);
    expect(closedItem).toMatchObject({ status: 'resolved', resolution: 'remove_content', resolvedByUsername: admin.username, targetExists: false });
  });

  it('suspends an account: blocks sign-in and API access and hides their work', async () => {
    const tag = `susp${crypto.randomUUID().slice(0, 8)}`;
    await request(app).put(`/api/portfolio/artworks/${artworkId}`).set(auth(author.token)).send({ tags: [tag] });
    await report(reporter.token, { targetType: 'user', targetId: author.username, reason: 'impersonation' });

    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    const item = queue.body.reports.find((r: { targetType: string; targetUsername: string }) => r.targetType === 'user' && r.targetUsername === author.username);
    await request(app)
      .post(`/api/admin/reports/${item.id}/resolve`)
      .set(auth(admin.token))
      .send({ action: 'suspend_user', note: 'Pretending to be a studio' });

    const login = await request(app).post('/api/auth/login').send({ email: author.email, password: author.password });
    expect(login.status).toBe(403);
    expect(login.body.error).toContain('Pretending to be a studio');

    expect((await request(app).get('/api/auth/me').set(auth(author.token))).status).toBe(403);
    expect((await request(app).get(`/api/users/${author.username}/portfolio?all=true`)).status).toBe(404);
    expect((await request(app).get(`/api/feed?tab=latest&tag=${tag}`)).body.artworks).toHaveLength(0);

    // Lifting the suspension restores everything.
    const users = await request(app).get(`/api/admin/users?q=${author.username}`).set(auth(admin.token));
    expect(users.body.users[0].suspendedAt).not.toBeNull();
    await request(app).post(`/api/admin/users/${author.id}/suspend`).set(auth(admin.token)).send({ suspended: false });
    expect((await request(app).get('/api/auth/me').set(auth(author.token))).status).toBe(200);
    expect((await request(app).get(`/api/feed?tab=latest&tag=${tag}`)).body.artworks).toHaveLength(1);
  });

  it('reports /auth/me role so the UI can show the admin page', async () => {
    const me = await request(app).get('/api/auth/me').set(auth(admin.token));
    expect(me.body.role).toBe('admin');
  });
});
