import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
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
      .send({ email: userB.email });
    expect(conflict.status).toBe(400);

    const newEmail = `changed_${crypto.randomUUID().slice(0, 8)}@vitest.local`;
    const ok = await request(app)
      .put('/api/users/me/email')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ email: newEmail });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(newEmail);
  });

  it('changes the password only with the correct current password', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const wrongCurrent = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'newpassword123' });
    expect(wrongCurrent.status).toBe(401);

    const ok = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: user.password, newPassword: 'newpassword123' });
    expect(ok.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'newpassword123' });
    expect(loginNew.status).toBe(200);
  });
});
