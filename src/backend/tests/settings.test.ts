import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { outbox } from '../services/mail.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('account settings', () => {
  it('updates the username, rejecting a name already taken', async () => {
    const userA = await registerTestUser();
    const userB = await registerTestUser();
    createdUserIds.push(userA.id, userB.id);

    const conflict = await request(app)
      .put('/api/users/me/username')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: userB.username });
    expect(conflict.status).toBe(400);

    const newName = `renamed_${crypto.randomUUID().slice(0, 8)}`;
    const ok = await request(app)
      .put('/api/users/me/username')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: newName });
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe(newName);
  });

  it('updates the email, rejecting one already in use', async () => {
    const userA = await registerTestUser();
    const userB = await registerTestUser();
    createdUserIds.push(userA.id, userB.id);

    const conflict = await request(app)
      .put('/api/users/me/email')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ email: userB.email, password: userA.password });
    expect(conflict.status).toBe(400);

    const newEmail = `changed_${crypto.randomUUID().slice(0, 8)}@vitest.local`;
    const ok = await request(app)
      .put('/api/users/me/email')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ email: newEmail, password: userA.password });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(newEmail);
  });

  it('needs the password to change the email, so a session alone cannot take the account', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const newEmail = `taken_${crypto.randomUUID().slice(0, 8)}@vitest.local`;

    const missing = await request(app)
      .put('/api/users/me/email')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ email: newEmail });
    expect(missing.status).toBe(400);

    const wrong = await request(app)
      .put('/api/users/me/email')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ email: newEmail, password: 'not-the-password' });
    expect(wrong.status).toBe(401);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
    expect(me.body.email).toBe(user.email);
  });

  it('changes the password only through a link emailed to the account', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    // There is no way to set a new password with just a session.
    const direct = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: user.password, newPassword: 'newpassword123' });
    expect(direct.status).toBe(404);

    const before = outbox.length;
    const sent = await request(app)
      .post('/api/auth/password-reset-link')
      .set('Authorization', `Bearer ${user.token}`);
    expect(sent.status).toBe(200);
    expect((await request(app).post('/api/auth/password-reset-link')).status).toBe(401);

    const mail = outbox.slice(before).find(m => m.to === user.email);
    const token = mail?.text.match(/\/reset-password\?token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeDefined();

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'newpassword123' });
    expect(reset.status).toBe(200);

    const loginOld = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(loginOld.status).toBe(401);
    const loginNew = await request(app).post('/api/auth/login').send({ email: user.email, password: 'newpassword123' });
    expect(loginNew.status).toBe(200);
  });
});
