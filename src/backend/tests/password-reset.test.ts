import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { outbox } from '../services/mail.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('password reset', () => {
  it('responds the same whether or not the email exists (no account enumeration)', async () => {
    const known = await registerTestUser();
    createdUserIds.push(known.id);

    const forKnown = await request(app).post('/api/auth/forgot-password').send({ email: known.email });
    const forUnknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@vitest.local' });

    expect(forKnown.status).toBe(200);
    expect(forUnknown.status).toBe(200);
    expect(forKnown.body).toEqual(forUnknown.body);
  });

  it('issues a working reset token and rejects a garbage one', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    const emailed = outbox.filter(m => m.to === user.email).map(m => m.text).join('\n');
    const match = emailed.match(/reset-password\?token=([a-f0-9]+)/);
    expect(match).not.toBeNull();
    const token = match![1];

    const badReset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'brandnewpass123' });
    expect(badReset.status).toBe(400);

    const goodReset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnewpass123' });
    expect(goodReset.status).toBe(200);

    const loginWithNew = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'brandnewpass123' });
    expect(loginWithNew.status).toBe(200);

    const loginWithOld = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(loginWithOld.status).toBe(401);

    // Token should be single-use.
    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'anotherpass456' });
    expect(reuse.status).toBe(400);
  });
});
