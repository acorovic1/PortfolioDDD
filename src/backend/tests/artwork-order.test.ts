import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('artwork order', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let other: Awaited<ReturnType<typeof registerTestUser>>;
  const ids: string[] = [];

  const ownOrder = async () =>
    (await request(app).get('/api/portfolio').set(auth(owner.token))).body.map((a: { id: string }) => a.id);

  beforeAll(async () => {
    owner = await registerTestUser();
    other = await registerTestUser();
    createdUserIds.push(owner.id, other.id);
    for (let i = 0; i < 3; i++) ids.push(await createProcessedArtwork(owner.token));
  });

  it('lists new uploads at the end', async () => {
    expect(await ownOrder()).toEqual(ids);
  });

  it('saves a new order, shown to the owner and on the public profile', async () => {
    const order = [ids[2], ids[0], ids[1]];
    const res = await request(app).put('/api/portfolio/order').set(auth(owner.token)).send({ artworkIds: order });
    expect(res.status).toBe(200);

    expect(await ownOrder()).toEqual(order);
    const profile = await request(app).get(`/api/users/${owner.username}/portfolio?all=true`);
    expect(profile.body.artworks.map((a: { id: string }) => a.id)).toEqual(order);
  });

  it('keeps artworks that were left out in their place', async () => {
    await request(app).put('/api/portfolio/order').set(auth(owner.token)).send({ artworkIds: ids });
    // Swap the outer two; the middle one isn't listed.
    const res = await request(app).put('/api/portfolio/order').set(auth(owner.token)).send({ artworkIds: [ids[2], ids[0]] });
    expect(res.status).toBe(200);
    expect(await ownOrder()).toEqual([ids[2], ids[1], ids[0]]);
  });

  it("rejects someone else's artworks, duplicates and anonymous requests", async () => {
    const notMine = await request(app).put('/api/portfolio/order').set(auth(other.token)).send({ artworkIds: [ids[0]] });
    expect(notMine.status).toBe(404);

    const duplicate = await request(app).put('/api/portfolio/order').set(auth(owner.token)).send({ artworkIds: [ids[0], ids[0]] });
    expect(duplicate.status).toBe(400);

    const anonymous = await request(app).put('/api/portfolio/order').send({ artworkIds: [ids[0]] });
    expect(anonymous.status).toBe(401);
  });
});
