import { describe, it, expect, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { outbox } from '../services/mail.ts';
import { sendNotificationDigests } from '../services/notification-mailer.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

afterEach(() => {
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
});

function mailsTo(email: string) {
  return outbox.filter(m => m.to === email);
}

// The token from the link in the latest email to `email` matching `path`.
function linkToken(email: string, path: string): string {
  const mail = mailsTo(email).reverse().find(m => m.text.includes(path));
  const match = mail?.text.match(new RegExp(`${path}\\?token=([a-f0-9]{64})`));
  if (!match) throw new Error(`No ${path} link emailed to ${email}`);
  return match[1];
}

async function register() {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

async function verify(email: string) {
  const res = await request(app).post('/api/auth/verify-email').send({ token: linkToken(email, '/verify-email') });
  expect(res.status).toBe(200);
}

describe('email verification', () => {
  it('emails a confirmation link on sign-up that verifies the account once', async () => {
    const user = await register();
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).body.emailVerified).toBe(false);

    const mail = mailsTo(user.email).find(m => m.subject.startsWith('Confirm your email'));
    expect(mail?.html).toContain('/verify-email?token=');

    const token = linkToken(user.email, '/verify-email');
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).body.emailVerified).toBe(true);

    // Single use.
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
    // Nothing left to resend.
    expect((await request(app).post('/api/auth/resend-verification').set(auth(user.token))).status).toBe(400);
  });

  it('resending replaces the earlier link', async () => {
    const user = await register();
    const first = linkToken(user.email, '/verify-email');
    expect((await request(app).post('/api/auth/resend-verification').set(auth(user.token))).status).toBe(200);
    const second = linkToken(user.email, '/verify-email');
    expect(second).not.toBe(first);

    expect((await request(app).post('/api/auth/verify-email').send({ token: first })).status).toBe(400);
    expect((await request(app).post('/api/auth/verify-email').send({ token: second })).status).toBe(200);
  });

  it('a changed address needs confirming again, and the old one is told', async () => {
    const user = await register();
    await verify(user.email);

    const newEmail = `new_${user.username}@vitest.local`;
    const res = await request(app).put('/api/users/me/email').set(auth(user.token)).send({ email: newEmail, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(false);

    expect(mailsTo(user.email).some(m => m.subject.includes('email was changed') && m.text.includes(newEmail))).toBe(true);
    await verify(newEmail);
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).body.emailVerified).toBe(true);
  });

  it('REQUIRE_EMAIL_VERIFICATION blocks unverified accounts from commenting', async () => {
    const artist = await register();
    const artworkId = await createProcessedArtwork(artist.token);
    const commenter = await register();
    const comment = () => request(app)
      .post(`/api/portfolio/artworks/${artworkId}/comments`)
      .set(auth(commenter.token))
      .send({ text: 'Nice' });

    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    const blocked = await comment();
    expect(blocked.status).toBe(403);
    expect(blocked.body.emailUnverified).toBe(true);

    await verify(commenter.email);
    expect((await comment()).status).toBe(201);
  });
});

describe('password reset email', () => {
  it('emails a reset link; using it changes the password and confirms the address', async () => {
    const user = await register();
    expect((await request(app).post('/api/auth/forgot-password').send({ email: user.email })).status).toBe(200);

    const token = linkToken(user.email, '/reset-password');
    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brand-new-pass' });
    expect(reset.status).toBe(200);

    expect(mailsTo(user.email).some(m => m.subject.includes('password was changed'))).toBe(true);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'brand-new-pass' });
    expect(login.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(login.body.token))).body.emailVerified).toBe(true);
  });

  it('answers the same for unknown addresses, without sending anything', async () => {
    const before = outbox.length;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here@vitest.local' });
    expect(res.status).toBe(200);
    expect(outbox.slice(before).some(m => m.to === 'nobody-here@vitest.local')).toBe(false);
  });
});

describe('notification digests', () => {
  async function notify(userId: string, message: string) {
    await createNotification({ id: crypto.randomUUID(), userId, actorUsername: 'someone', type: 'follow', message });
  }

  it('emails unread notifications once, as one digest, to verified opted-in users', async () => {
    const user = await register();
    await verify(user.email);
    await notify(user.id, '@someone followed you');
    await notify(user.id, '@someone liked "Helmet"');

    await sendNotificationDigests(0);
    const digests = mailsTo(user.email).filter(m => m.subject.includes('notification'));
    expect(digests).toHaveLength(1);
    expect(digests[0].text).toContain('@someone followed you');
    expect(digests[0].text).toContain('liked "Helmet"');

    // Already emailed.
    await sendNotificationDigests(0);
    expect(mailsTo(user.email).filter(m => m.subject.includes('notification'))).toHaveLength(1);
  });

  it('skips read notifications, unverified addresses and people who opted out', async () => {
    const unverified = await register();
    await notify(unverified.id, 'for unverified');

    const optedOut = await register();
    await verify(optedOut.email);
    await request(app).put('/api/users/me').set(auth(optedOut.token)).send({ emailNotifications: false });
    await notify(optedOut.id, 'for opted out');

    const reader = await register();
    await verify(reader.email);
    await notify(reader.id, 'already seen');
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [reader.id]);

    await sendNotificationDigests(0);
    for (const u of [unverified, optedOut, reader]) {
      expect(mailsTo(u.email).filter(m => m.subject.includes('notification'))).toHaveLength(0);
    }
  });

  it('waits before emailing, so active users see notifications on the site first', async () => {
    const user = await register();
    await verify(user.email);
    await notify(user.id, 'too recent');

    await sendNotificationDigests(600);
    expect(mailsTo(user.email).filter(m => m.subject.includes('notification'))).toHaveLength(0);
  });
});
