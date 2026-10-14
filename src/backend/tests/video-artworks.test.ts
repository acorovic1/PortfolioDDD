import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

// The start of an MP4 (an 'ftyp' box) - enough for the server, which never
// decodes the video itself.
const mp4 = () => Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(64),
]);
// A WebM starts with an EBML header.
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
// The frame the uploader's browser grabbed.
const poster = () => sharp({ create: { width: 640, height: 360, channels: 3, background: '#2b6a8f' } }).webp().toBuffer();

const VIDEO_FIELDS = { width: '1920', height: '1080', duration: '12.5' };

async function uploadVideo(
  token: string,
  fields: Record<string, string> = VIDEO_FIELDS,
  { file = mp4(), name = 'turntable.mp4', withPoster = true }: { file?: Buffer; name?: string; withPoster?: boolean } = {},
) {
  let req = request(app).post('/api/portfolio/artworks/video').set('Authorization', `Bearer ${token}`).field('title', 'Turntable');
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  req = req.attach('video', file, name);
  if (withPoster) req = req.attach('poster', await poster(), 'poster.webp');
  return req;
}

const localFile = (url: string) => path.join(process.cwd(), url.replace(/^\//, ''));

describe('video artworks', () => {
  it('stores the video with its size, length, a thumbnail from the poster, and the canvas', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await uploadVideo(user.token, { ...VIDEO_FIELDS, edge: 'white', medium: 'digital_painting' });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('video');
    expect(res.body.processingStatus).toBe('ready');
    expect(res.body.videoUrl).toMatch(/^\/uploads\/videos\/[\w-]+\.mp4$/);
    expect(res.body.imageUrl).toBeNull();
    expect(res.body.imageWidth).toBe(1920);
    expect(res.body.imageHeight).toBe(1080);
    expect(res.body.videoDuration).toBeCloseTo(12.5);
    expect(res.body.thumbnailUrl).toMatch(/^\/uploads\/thumbnails\/[\w-]+\.webp$/);
    expect(res.body.canvas).toEqual({ edge: 'white', medium: 'digital_painting' });
    expect(existsSync(localFile(res.body.videoUrl))).toBe(true);
    expect(existsSync(localFile(res.body.thumbnailUrl))).toBe(true);

    // Listed right away, like a 2D artwork.
    const batch = await request(app).get(`/api/portfolio/artworks/batch?ids=${res.body.id}`);
    expect(batch.body).toHaveLength(1);

    // Served as video, with range requests for seeking.
    const range = await request(app).get(res.body.videoUrl).set('Range', 'bytes=0-15');
    expect(range.status).toBe(206);
    expect(range.headers['content-type']).toBe('video/mp4');
  });

  it('accepts WebM', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    const res = await uploadVideo(user.token, VIDEO_FIELDS, { file: webm(), name: 'loop.webm' });
    expect(res.status).toBe(201);
    expect(res.body.videoUrl).toMatch(/\.webm$/);
  });

  it('rejects what is not a playable upload', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);

    // An .mp4 that isn't one.
    const fake = await uploadVideo(user.token, VIDEO_FIELDS, { file: Buffer.from('definitely not a video, just text') });
    expect(fake.status).toBe(400);
    // Formats browsers don't play.
    const mov = await uploadVideo(user.token, VIDEO_FIELDS, { name: 'clip.mov' });
    expect(mov.status).toBe(400);
    // No poster, or no size.
    expect((await uploadVideo(user.token, VIDEO_FIELDS, { withPoster: false })).status).toBe(400);
    expect((await uploadVideo(user.token, { duration: '3' })).status).toBe(400);
    expect((await uploadVideo(user.token, { ...VIDEO_FIELDS, duration: '-1' })).status).toBe(400);
  });

  it('has a canvas but no model or thumbnail to replace', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const id = (await uploadVideo(user.token)).body.id;

    const canvas = { edge: 'white', medium: null };
    const updated = await request(app).put(`/api/portfolio/artworks/${id}`).set('Authorization', `Bearer ${user.token}`).send({ canvas });
    expect(updated.status).toBe(200);
    expect(updated.body.canvas).toEqual(canvas);

    const replace = await request(app).put(`/api/portfolio/artworks/${id}/model`).set('Authorization', `Bearer ${user.token}`)
      .attach('model', Buffer.from('{}'), 'model.gltf');
    expect(replace.status).toBe(400);
  });

  it('deletes the video and its thumbnail with the artwork', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    const created = await uploadVideo(user.token);

    const res = await request(app).delete(`/api/portfolio/artworks/${created.body.id}`).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(existsSync(localFile(created.body.videoUrl))).toBe(false);
    expect(existsSync(localFile(created.body.thumbnailUrl))).toBe(false);
  });
});

describe('video renders', () => {
  it('adds videos as renders, but never uses one as the cover', async () => {
    const user = await registerTestUser();
    createdUserIds.push(user.id);
    // A unique title to find it in the feed.
    const title = `Render host ${crypto.randomUUID()}`;
    const image = await request(app).post('/api/portfolio/artworks/image').set('Authorization', `Bearer ${user.token}`)
      .field('title', title)
      .attach('image', await sharp({ create: { width: 200, height: 200, channels: 3, background: '#999' } }).png().toBuffer(), 'art.png');
    const id = image.body.id;
    const addRender = (file: Buffer, name: string) => request(app).post(`/api/portfolio/artworks/${id}/renders`)
      .set('Authorization', `Bearer ${user.token}`).field('caption', name).attach('image', file, name);

    // The video comes first, so a naive "first render" would pick it.
    const video = await addRender(mp4(), 'animation.mp4');
    expect(video.status).toBe(201);
    expect(video.body.url).toMatch(/^\/uploads\/renders\/[\w-]+\.mp4$/);
    const still = await addRender(await poster(), 'still.webp');
    expect(still.status).toBe(201);

    expect((await addRender(Buffer.from('not a video'), 'fake.mp4')).status).toBe(400);
    expect((await addRender(mp4(), 'clip.mov')).status).toBe(400);

    const feed = await request(app).get(`/api/feed?tab=recent&q=${encodeURIComponent(title)}`);
    const card = feed.body.artworks.find((a: { id: string }) => a.id === id);
    expect(card.coverUrl).toBe(still.body.url);
  });
});
