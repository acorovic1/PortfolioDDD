import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('auth', () => {
  it('registers a new user', async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `alice_${suffix}`, email: `alice_${suffix}@vitest.local`, password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe(`alice_${suffix}`);
    createdUserIds.push(res.body.user.id);
  });

  it('rejects registering a duplicate email/username', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: user.username, email: user.email, password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('rejects registration with an invalid payload', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const good = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('returns the current user for a valid token, and rejects missing/invalid tokens', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const withToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);
    expect(withToken.status).toBe(200);
    expect(withToken.body.username).toBe(user.username);

    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage');
    expect(badToken.status).toBe(403);
  });

  it('refreshes a valid token into a new working one, and rejects an invalid one', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    const meWithNewToken = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(meWithNewToken.status).toBe(200);
    expect(meWithNewToken.body.username).toBe(user.username);

    const rejected = await request(app).post('/api/auth/refresh');
    expect(rejected.status).toBe(401);
  });
});
