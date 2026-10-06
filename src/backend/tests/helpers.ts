import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { waitForModelJobs } from '../pipeline/processor.ts';

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
  // Let queued model uploads finish first, so none is left half-processed
  // (and its raw upload orphaned) when the test process exits.
  await waitForModelJobs();
  if (ids.length === 0) return;
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

const triangleGltf = readFileSync(path.join(process.cwd(), 'e2e', 'fixtures', 'blue-triangle.gltf'));

// Uploads a real (tiny) model and waits for processing, so the artwork is
// ready and - unless `fields` says otherwise - published and listed.
export async function createProcessedArtwork(
  token: string,
  fields: Record<string, unknown> = {}
): Promise<string> {
  const created = await request(app)
    .post('/api/portfolio/artworks')
    .set('Authorization', `Bearer ${token}`)
    .field('title', String(fields.title ?? `Artwork ${crypto.randomUUID().slice(0, 6)}`))
    .field('draft', String(fields.draft ?? 'false'))
    .attach('model', triangleGltf, 'model.gltf');
  if (created.status !== 201) throw new Error(`Failed to create artwork: ${created.status}`);
  await waitForModelJobs();

  const rest = { ...fields };
  delete rest.title;
  delete rest.draft;
  if (Object.keys(rest).length > 0) {
    const updated = await request(app)
      .put(`/api/portfolio/artworks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(rest);
    if (updated.status !== 200) throw new Error(`Failed to update artwork: ${updated.status} ${JSON.stringify(updated.body)}`);
  }
  return created.body.id as string;
}
