import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { pageMeta } from '../seo/seo.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

async function register() {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const rename = (token: string, username: string) =>
  request(app).put('/api/users/me/username').set(auth(token)).send({ username });

const suffix = () => crypto.randomUUID().slice(0, 6);

describe('renamed profiles', () => {
  it('old names point to the new one, through several renames', async () => {
    const user = await register();
    const first = user.username;
    const second = `second_${suffix()}`;
    const third = `third_${suffix()}`;
    expect((await rename(user.token, second)).status).toBe(200);
    expect((await rename(user.token, third)).status).toBe(200);

    for (const old of [first, second]) {
      const res = await request(app).get(`/api/users/${old}/portfolio`);
      expect(res.status).toBe(404);
      expect(res.body.movedTo).toBe(third);
    }
    expect((await request(app).get(`/api/users/${third}/portfolio`)).status).toBe(200);
  });

  it("keeps someone's old name from being taken by anyone else", async () => {
    const owner = await register();
    const oldName = owner.username;
    await rename(owner.token, `moved_${suffix()}`);

    const other = await register();
    expect((await rename(other.token, oldName)).status).toBe(400);
    const signup = await request(app).post('/api/auth/register')
      .send({ username: oldName, email: `${suffix()}@vitest.local`, password: 'password123' });
    expect(signup.status).toBe(400);

    // ...but its owner can take it back, and then it no longer redirects.
    expect((await rename(owner.token, oldName)).status).toBe(200);
    const res = await request(app).get(`/api/users/${oldName}/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body.movedTo).toBeUndefined();
  });

  it('frees an old name once the reservation has run out', async () => {
    const owner = await register();
    const oldName = owner.username;
    await rename(owner.token, `moved_${suffix()}`);
    await pool.query(`UPDATE username_history SET changed_at = NOW() - INTERVAL '181 days' WHERE old_username = $1`, [oldName]);

    const other = await register();
    expect((await rename(other.token, oldName)).status).toBe(200);
    // The name is someone else's now, so it no longer redirects.
    const res = await request(app).get(`/api/users/${oldName}/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body.movedTo).toBeUndefined();
    const history = await pool.query('SELECT 1 FROM username_history WHERE old_username = $1', [oldName]);
    expect(history.rowCount).toBe(0);
  });
});

describe('profile URLs', () => {
  it('/@username is the canonical address; /u/username still works', async () => {
    const user = await register();
    for (const path of [`/@${user.username}`, `/u/${user.username}`]) {
      const meta = await pageMeta(path, {});
      expect(meta.canonicalPath).toBe(`/@${user.username}`);
      expect(meta.type).toBe('profile');
    }
  });

  it.skipIf(!existsSync('dist/index.html'))('permanently redirects renamed profile pages', async () => {
    const user = await register();
    const oldName = user.username;
    const newName = `renamed_${suffix()}`;
    await rename(user.token, newName);

    const res = await request(app).get(`/u/${oldName}?artwork=abc`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`/@${newName}?artwork=abc`);

    const page = await request(app).get(`/@${newName}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`<link rel="canonical" href="http://127.0.0.1`);
    expect(page.text).toContain(`/@${newName}"`);
  });
});
