import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
type TestUser = Awaited<ReturnType<typeof registerTestUser>>;

async function newUser(): Promise<TestUser> {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('richer profiles', () => {
  it('stores links, availability and experience, and shows them on the public profile', async () => {
    const artist = await newUser();
    const update = await request(app)
      .put('/api/users/me')
      .set(auth(artist.token))
      .send({
        website: 'myportfolio.com',
        socialLinks: { artstation: 'https://artstation.com/me', instagram: '' },
        availableForWork: true,
        workTypes: ['freelance', 'contract'],
        experience: [
          { role: 'Senior 3D Artist', company: 'Studio X', start: '2021-03', end: '', description: 'Hero props' },
          { role: '3D Artist', company: 'Indie Co', start: '2018', end: '2021-02' },
        ],
      });
    expect(update.status).toBe(200);
    expect(update.body.website).toBe('https://myportfolio.com/');
    // Empty links are dropped.
    expect(update.body.socialLinks).toEqual({ artstation: 'https://artstation.com/me' });

    const profile = await request(app).get(`/api/users/${artist.username}/portfolio?all=true`);
    expect(profile.body.user).toMatchObject({
      availableForWork: true,
      workTypes: ['freelance', 'contract'],
      website: 'https://myportfolio.com/',
    });
    expect(profile.body.user.experience).toHaveLength(2);

    const summary = await request(app).get(`/api/users/${artist.username}/summary`);
    expect(summary.body).toMatchObject({ availableForWork: true, workTypes: ['freelance', 'contract'] });
  });

  it('rejects non-web links (no javascript: URLs)', async () => {
    const user = await newUser();
    for (const body of [
      { website: 'javascript:alert(1)' },
      { github: 'javascript:alert(document.cookie)' },
      { socialLinks: { x: 'data:text/html,hi' } },
    ]) {
      expect((await request(app).put('/api/users/me').set(auth(user.token)).send(body)).status).toBe(400);
    }
  });

  it('validates experience dates', async () => {
    const user = await newUser();
    const res = await request(app)
      .put('/api/users/me')
      .set(auth(user.token))
      .send({ experience: [{ role: 'Artist', company: 'X', start: 'last year' }] });
    expect(res.status).toBe(400);
  });

  it('uploads a cover image', async () => {
    const user = await newUser();
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const res = await request(app).post('/api/users/me/cover').set(auth(user.token)).attach('cover', png, 'cover.png');
    expect(res.status).toBe(200);
    expect(res.body.coverUrl).toMatch(/^\/uploads\/covers\//);
  });
});

describe('messages', () => {
  let client: TestUser;
  let artist: TestUser;

  beforeAll(async () => {
    client = await newUser();
    artist = await newUser();
  });

  const unread = async (user: TestUser) =>
    (await request(app).get('/api/messages/unread').set(auth(user.token))).body.count;
  const notificationsOfType = async (user: TestUser, type: string) =>
    (await request(app).get('/api/notifications?limit=50').set(auth(user.token))).body.notifications
      .filter((n: { type: string }) => n.type === type).length;

  it('sends messages, tracks unread counts and notifies once per unread streak', async () => {
    const first = await request(app)
      .post(`/api/messages/${artist.username}`)
      .set(auth(client.token))
      .send({ body: 'Hi! Love your work.' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: 'Hi! Love your work.', fromMe: true, kind: 'message' });
    await request(app).post(`/api/messages/${artist.username}`).set(auth(client.token)).send({ body: 'Are you open to commissions?' });

    expect(await unread(artist)).toBe(2);
    expect(await notificationsOfType(artist, 'message')).toBe(1);

    const list = await request(app).get('/api/messages').set(auth(artist.token));
    expect(list.body.conversations[0]).toMatchObject({
      username: client.username,
      unread: 2,
      lastMessage: { body: 'Are you open to commissions?', fromMe: false },
    });

    // Opening the thread marks it read.
    const thread = await request(app).get(`/api/messages/${client.username}`).set(auth(artist.token));
    expect(thread.body.messages.map((m: { body: string }) => m.body)).toEqual(['Hi! Love your work.', 'Are you open to commissions?']);
    expect(thread.body.messages[0].fromMe).toBe(false);
    expect(await unread(artist)).toBe(0);

    // Replying doesn't create unread messages for the replier.
    await request(app).post(`/api/messages/${client.username}`).set(auth(artist.token)).send({ body: 'Yes I am!' });
    expect(await unread(artist)).toBe(0);
    expect(await unread(client)).toBe(1);
  });

  it('sends structured hire requests that always notify', async () => {
    const res = await request(app)
      .post(`/api/messages/${artist.username}/hire`)
      .set(auth(client.token))
      .send({ projectTitle: 'Game-ready mech', workType: 'freelance', budget: '$2,000', timeline: '6 weeks', details: 'Need a hero mech.' });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('hire');
    expect(res.body.meta).toMatchObject({ projectTitle: 'Game-ready mech', budget: '$2,000' });
    expect(res.body.body).toContain('Hire request: Game-ready mech');
    expect(await notificationsOfType(artist, 'hire')).toBe(1);
  });

  it("doesn't allow messaging yourself, blocked users, or blockers", async () => {
    expect((await request(app).post(`/api/messages/${client.username}`).set(auth(client.token)).send({ body: 'me' })).status).toBe(400);

    await request(app).post(`/api/users/${client.username}/block`).set(auth(artist.token));
    // The blocked person can't reach the blocker at all...
    expect((await request(app).post(`/api/messages/${artist.username}`).set(auth(client.token)).send({ body: 'hello?' })).status).toBe(404);
    // ...and the blocker has to unblock before writing.
    expect((await request(app).post(`/api/messages/${client.username}`).set(auth(artist.token)).send({ body: 'hi' })).status).toBe(403);
    const thread = await request(app).get(`/api/messages/${client.username}`).set(auth(artist.token));
    expect(thread.body.canMessage).toBe(false);
  });
});
