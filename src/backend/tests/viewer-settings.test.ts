import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const settings = {
  post: {
    environment: true, toneMapping: 'agx', exposure: 1.4, ambientOcclusion: true,
    bloom: false, bloomStrength: 0.35, vignette: true, background: '#202533',
  },
  camera: { direction: [0.5, 0.3, 0.81], distanceFactor: 0.8 },
  autoRotate: true,
};

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('saved viewer settings', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let artworkId: string;

  beforeAll(async () => {
    owner = await registerTestUser();
    createdUserIds.push(owner.id);
    artworkId = await createProcessedArtwork(owner.token);
  });

  it('saves the default view and returns it to everyone', async () => {
    const save = await request(app).put(`/api/portfolio/artworks/${artworkId}`).set(auth(owner.token)).send({ viewerSettings: settings });
    expect(save.status).toBe(200);
    expect(save.body.viewerSettings).toEqual(settings);

    const profile = await request(app).get(`/api/users/${owner.username}/portfolio?all=true`);
    expect(profile.body.artworks[0].viewerSettings).toEqual(settings);
  });

  it('rejects malformed settings', async () => {
    for (const bad of [
      { ...settings, post: { ...settings.post, background: 'red' } },
      { ...settings, post: { ...settings.post, exposure: 50 } },
      { ...settings, camera: { direction: [2, 0, 0], distanceFactor: 1 } },
    ]) {
      const res = await request(app).put(`/api/portfolio/artworks/${artworkId}`).set(auth(owner.token)).send({ viewerSettings: bad });
      expect(res.status).toBe(400);
    }
  });

  it('clears back to defaults with null', async () => {
    const res = await request(app).put(`/api/portfolio/artworks/${artworkId}`).set(auth(owner.token)).send({ viewerSettings: null });
    expect(res.body.viewerSettings).toBeNull();
  });
});
