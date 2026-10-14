import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { pool } from '../config/db.ts';

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

describe('message safety', () => {
  const send = (from: TestUser, to: TestUser, body: string) =>
    request(app).post(`/api/messages/${to.username}`).set(auth(from.token)).send({ body });
  const setMessagesFrom = (user: TestUser, messagesFrom: string) =>
    request(app).put('/api/users/me').set(auth(user.token)).send({ messagesFrom });

  it('stores message bodies and hire details encrypted, and reads them back', async () => {
    const [a, b] = [await newUser(), await newUser()];
    await send(a, b, 'Top secret plan');
    await request(app).post(`/api/messages/${b.username}/hire`).set(auth(a.token))
      .send({ projectTitle: 'Secret project', budget: '$5', details: 'Shh' });

    const { rows } = await pool.query<{ body: string; meta: Record<string, unknown> | null }>(
      'SELECT body, meta FROM messages WHERE sender_id = $1',
      [a.id]
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.body.startsWith('m1:')).toBe(true);
      expect(row.body).not.toContain('Secret');
      expect(JSON.stringify(row.meta ?? {})).not.toContain('Secret');
    }

    const thread = await request(app).get(`/api/messages/${a.username}`).set(auth(b.token));
    expect(thread.body.messages[0].body).toBe('Top secret plan');
    expect(thread.body.messages[1].meta).toMatchObject({ projectTitle: 'Secret project', budget: '$5' });
    const list = await request(app).get('/api/messages').set(auth(b.token));
    expect(list.body.conversations[0].lastMessage.body).toContain('Hire request: Secret project');
  });

  it('respects "who can message me", but a reply reopens the conversation', async () => {
    const [stranger, artist] = [await newUser(), await newUser()];

    expect((await setMessagesFrom(artist, 'nobody')).body.messagesFrom).toBe('nobody');
    const refused = await send(stranger, artist, 'hi');
    expect(refused.status).toBe(403);
    expect(refused.body.restriction).toBe('not_accepting');

    await setMessagesFrom(artist, 'following');
    expect((await send(stranger, artist, 'hi')).status).toBe(403);
    // Following the stranger lets them in.
    await request(app).post(`/api/users/${stranger.username}/follow`).set(auth(artist.token));
    expect((await send(stranger, artist, 'hi')).status).toBe(201);

    // Once the artist writes back, the setting no longer applies to them.
    await request(app).delete(`/api/users/${stranger.username}/follow`).set(auth(artist.token));
    await setMessagesFrom(artist, 'nobody');
    await send(artist, stranger, 'hello!');
    expect((await send(stranger, artist, 'thanks')).status).toBe(201);
  });

  it('takes hire requests from anyone when available for work, unless set to nobody', async () => {
    const [client, artist] = [await newUser(), await newUser()];
    await request(app).put('/api/users/me').set(auth(artist.token)).send({ availableForWork: true, messagesFrom: 'following' });
    const hire = () => request(app).post(`/api/messages/${artist.username}/hire`).set(auth(client.token))
      .send({ projectTitle: 'Prop', details: 'A chair' });
    expect((await hire()).status).toBe(201);
    await setMessagesFrom(artist, 'nobody');
    expect((await hire()).status).toBe(403);
  });

  it('caps unanswered messages until the recipient replies', async () => {
    const [a, b] = [await newUser(), await newUser()];
    for (let i = 0; i < 3; i++) expect((await send(a, b, `ping ${i}`)).status).toBe(201);
    const fourth = await send(a, b, 'ping 3');
    expect(fourth.status).toBe(429);
    expect(fourth.body.restriction).toBe('awaiting_reply');
    expect((await request(app).get(`/api/messages/${b.username}`).set(auth(a.token))).body).toMatchObject({
      canMessage: false, restriction: 'awaiting_reply',
    });

    await send(b, a, 'pong');
    expect((await send(a, b, 'ping 3')).status).toBe(201);
  });

  it('caps how many new conversations an account starts per day', async () => {
    const spammer = await newUser();
    const targets = await Promise.all(Array.from({ length: 21 }, () => newUser()));
    for (const target of targets.slice(0, 20)) expect((await send(spammer, target, 'buy now')).status).toBe(201);
    expect((await send(spammer, targets[20], 'buy now')).status).toBe(429);
    // Existing conversations are unaffected.
    expect((await send(spammer, targets[0], 'still here')).status).toBe(201);
  });

  it('hides conversations with blocked or suspended users from the inbox and unread count', async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    await send(b, a, 'from b');
    await send(c, a, 'from c');
    const inbox = async () => (await request(app).get('/api/messages').set(auth(a.token))).body.conversations
      .map((conv: { username: string }) => conv.username);
    const unread = async () => (await request(app).get('/api/messages/unread').set(auth(a.token))).body.count;
    expect(await inbox()).toEqual(expect.arrayContaining([b.username, c.username]));
    expect(await unread()).toBe(2);

    // b blocks a: the conversation leaves both inboxes.
    await request(app).post(`/api/users/${a.username}/block`).set(auth(b.token));
    expect(await inbox()).not.toContain(b.username);
    expect((await request(app).get('/api/messages').set(auth(b.token))).body.conversations).toHaveLength(0);

    await pool.query('UPDATE users SET suspended_at = NOW() WHERE id = $1', [c.id]);
    expect(await inbox()).toHaveLength(0);
    expect(await unread()).toBe(0);
  });

  it('rejects a malformed "before" cursor with 400', async () => {
    const [a, b] = [await newUser(), await newUser()];
    expect((await request(app).get(`/api/messages/${b.username}?before=not-a-date`).set(auth(a.token))).status).toBe(400);
    expect((await request(app).get(`/api/messages/${b.username}?before=2026-01-01T00:00:00Z`).set(auth(a.token))).status).toBe(200);
  });

  it('lets only the recipient report a message, and admins remove it', async () => {
    const [sender, recipient, outsider, admin] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const message = (await send(sender, recipient, 'abusive text')).body;
    const report = (user: TestUser) => request(app).post('/api/reports').set(auth(user.token))
      .send({ targetType: 'message', targetId: message.id, reason: 'harassment' });

    // Messages are private: others can't even tell it exists.
    expect((await report(outsider)).status).toBe(404);
    expect((await report(sender)).status).toBe(400);
    expect((await report(recipient)).status).toBe(201);

    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    const item = queue.body.reports.find((r: { targetId: string }) => r.targetId === message.id);
    expect(item).toMatchObject({
      targetType: 'message', targetSummary: 'abusive text', targetUsername: sender.username, targetExists: true,
    });

    const resolved = await request(app).post(`/api/admin/reports/${item.id}/resolve`).set(auth(admin.token))
      .send({ action: 'remove_content' });
    expect(resolved.status).toBe(200);
    const thread = await request(app).get(`/api/messages/${sender.username}`).set(auth(recipient.token));
    expect(thread.body.messages).toHaveLength(0);
  });
});
