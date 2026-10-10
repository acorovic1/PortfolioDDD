import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
const model = readFileSync(path.join(process.cwd(), 'e2e', 'fixtures', 'blue-triangle.gltf'));

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

async function upload(token: string, fields: Record<string, string>) {
  let req = request(app).post('/api/portfolio/artworks').set('Authorization', `Bearer ${token}`).field('title', 'Piece');
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req.attach('model', model, 'model.gltf');
}

describe('publishing choice at upload', () => {
  it('publishes now, saves a draft, or schedules', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const now = await upload(user.token, {});
    expect(now.status).toBe(201);
    expect(new Date(now.body.publishedAt).getTime()).toBeLessThanOrEqual(Date.now());

    const draft = await upload(user.token, { draft: 'true', publishAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(draft.body.publishedAt).toBeNull();

    const at = new Date(Date.now() + 2 * 86_400_000);
    at.setMilliseconds(0);
    const scheduled = await upload(user.token, { publishAt: at.toISOString() });
    expect(new Date(scheduled.body.publishedAt).toISOString()).toBe(at.toISOString());

    // A time that has already passed just publishes it.
    const past = await upload(user.token, { publishAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(Math.abs(new Date(past.body.publishedAt).getTime() - Date.now())).toBeLessThan(60_000);

    expect((await upload(user.token, { publishAt: 'next tuesday' })).status).toBe(400);
  });
});
