import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';
import { pageMeta, renderHead } from '../seo/seo.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const binary = (r: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const stream = r as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
};

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('page metadata', () => {
  let artist: Awaited<ReturnType<typeof registerTestUser>>;
  let artworkId: string;
  let unlistedId: string;

  beforeAll(async () => {
    artist = await registerTestUser();
    createdUserIds.push(artist.id);
    await request(app).put('/api/users/me').set(auth(artist.token)).send({ title: 'Prop artist', bio: 'I make <weapons> & props.' });
    artworkId = await createProcessedArtwork(artist.token, { title: 'Plasma "Rifle"', description: 'A sci-fi rifle.', tags: ['scifi'] });
    unlistedId = await createProcessedArtwork(artist.token, { title: 'Secret', visibility: 'unlisted' });
  });

  it('describes profiles and artworks, and keeps private pages out of the index', async () => {
    const profile = await pageMeta(`/u/${artist.username}`, {});
    expect(profile).toMatchObject({ type: 'profile', noindex: false, description: 'I make <weapons> & props.' });
    expect(profile.title).toContain(`@${artist.username} - Prop artist`);

    const artwork = await pageMeta(`/u/${artist.username}`, { artwork: artworkId });
    expect(artwork).toMatchObject({ type: 'article', description: 'A sci-fi rifle.', image: `/og/artwork/${artworkId}.jpg` });
    expect(artwork.jsonLd).toMatchObject({ '@type': 'VisualArtwork', name: 'Plasma "Rifle"', keywords: 'scifi' });

    expect((await pageMeta(`/u/${artist.username}`, { artwork: unlistedId })).noindex).toBe(true);
    expect((await pageMeta('/settings', {})).noindex).toBe(true);
    expect((await pageMeta('/u/nobody_here_123', {})).noindex).toBe(true);
  });

  it('marks NoAI creators for crawlers', async () => {
    await request(app).put('/api/users/me').set(auth(artist.token)).send({ noAiTraining: true });
    const meta = await pageMeta(`/u/${artist.username}`, {});
    expect(renderHead(meta, 'https://example.com')).toContain('<meta name="robots" content="noai, noimageai" />');
    await request(app).put('/api/users/me').set(auth(artist.token)).send({ noAiTraining: false });
  });

  it('escapes user content in tags and JSON-LD', async () => {
    const head = renderHead({
      title: 'x" onload="alert(1)', description: '</script><script>alert(1)</script>', image: null,
      type: 'website', noindex: false, noai: false, canonicalPath: '/',
      jsonLd: { name: '</script><script>alert(1)</script>' },
    }, 'https://example.com');
    expect(head).not.toContain('<script>alert(1)');
    expect(head).toContain('&quot; onload=&quot;');
    expect(head).toContain('\u003c/script>');
  });

  it.skipIf(!existsSync('dist/index.html'))('injects the metadata into the served app', async () => {
    const res = await request(app).get(`/u/${artist.username}`).query({ artwork: artworkId });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Plasma &quot;Rifle&quot; by');
    expect(res.text).toContain('property="og:image"');
    expect(res.text).toContain(`/og/artwork/${artworkId}.jpg`);
    expect(res.text.match(/name="description"/g)).toHaveLength(1);
    expect(res.text).toContain('<div id="root">');
  });

  it('renders 1200x630 JPEG previews, with a placeholder when there is no image', async () => {
    const art = await request(app).get(`/og/artwork/${artworkId}.jpg`).buffer(true).parse(binary);
    expect(art.status).toBe(200);
    expect(art.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(art.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);

    const user = await request(app).get(`/og/user/${artist.username}.jpg`).buffer(true).parse(binary);
    expect(user.status).toBe(200);
    expect((await request(app).get('/og/user/nobody_here_123.jpg')).status).toBe(404);
  });

  it('publishes robots.txt and a sitemap of public work', async () => {
    const robots = await request(app).get('/robots.txt');
    expect(robots.text).toContain('Disallow: /api/');
    expect(robots.text).toContain('Sitemap: ');

    const sitemap = await request(app).get('/sitemap.xml');
    expect(sitemap.headers['content-type']).toContain('xml');
    expect(sitemap.text).toContain(`/u/${artist.username}?artwork=${artworkId}`);
    expect(sitemap.text).not.toContain(unlistedId);
  });
});
