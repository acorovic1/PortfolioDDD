import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';

export async function registerTestUser(overrides: { username?: string; email?: string; password?: string } = {}) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const username = overrides.username ?? `test_${suffix}`;
  const email = overrides.email ?? `${username}@vitest.local`;
  const password = overrides.password ?? 'password123';

  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password });

  if (res.status !== 201) {
    throw new Error(`Failed to register test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { token: res.body.token as string, id: res.body.user.id as string, username, email, password };
}

export async function deleteTestUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
