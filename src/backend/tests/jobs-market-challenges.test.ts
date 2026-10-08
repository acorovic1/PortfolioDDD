import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];
type TestUser = Awaited<ReturnType<typeof registerTestUser>>;

async function newUser(): Promise<TestUser> {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await pool.query("DELETE FROM challenges WHERE title LIKE 'Test challenge%'");
  await deleteTestUsers(createdUserIds);
});

describe('jobs board', () => {
  let studio: TestUser;
  let artist: TestUser;
  let jobId: string;
  const marker = `Zq${crypto.randomUUID().slice(0, 6)}`;

  beforeAll(async () => {
    studio = await newUser();
    artist = await newUser();
  });

  it('posts a job and lists it with filters', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set(auth(studio.token))
      .send({
        title: `Environment Artist ${marker}`,
        company: 'Pixel Forge',
        location: 'Berlin',
        workplace: 'remote',
        employmentType: 'contract',
        salary: '€500/day',
        description: 'Build modular sci-fi environments in Unreal.',
        skills: ['Unreal', 'Substance Designer'],
      });
    expect(res.status).toBe(201);
    jobId = res.body.id;

    const list = await request(app).get(`/api/jobs?q=${marker}`);
    expect(list.body.jobs.map((j: { id: string }) => j.id)).toEqual([jobId]);
    expect((await request(app).get(`/api/jobs?q=${marker}&workplace=onsite`)).body.jobs).toHaveLength(0);
    expect((await request(app).get(`/api/jobs?q=${marker}&skill=unreal`)).body.jobs).toHaveLength(1);
    expect((await request(app).get(`/api/jobs?q=${marker}&type=contract`)).body.jobs).toHaveLength(1);
  });

  it('lets artists apply once, messaging the poster, who sees the application', async () => {
    const apply = await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(artist.token)).send({ message: 'Here is my portfolio!' });
    expect(apply.status).toBe(201);
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(artist.token)).send({ message: 'again' })).status).toBe(409);
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(studio.token)).send({ message: 'me' })).status).toBe(400);

    const thread = await request(app).get(`/api/messages/${artist.username}`).set(auth(studio.token));
    expect(thread.body.messages[0].body).toContain('Application for');

    const apps = await request(app).get(`/api/jobs/${jobId}/applications`).set(auth(studio.token));
    expect(apps.body.applications).toMatchObject([{ username: artist.username, message: 'Here is my portfolio!' }]);
    expect((await request(app).get(`/api/jobs/${jobId}/applications`).set(auth(artist.token))).status).toBe(404);

    const asArtist = await request(app).get(`/api/jobs/${jobId}`).set(auth(artist.token));
    expect(asArtist.body.hasApplied).toBe(true);
    expect(asArtist.body.applicationCount).toBeNull();
  });

  it('hides closed jobs from everyone but the poster', async () => {
    await request(app).put(`/api/jobs/${jobId}`).set(auth(studio.token)).send({ isOpen: false });
    expect((await request(app).get(`/api/jobs?q=${marker}`)).body.jobs).toHaveLength(0);
    expect((await request(app).get(`/api/jobs/${jobId}`)).status).toBe(404);
    expect((await request(app).get(`/api/jobs/${jobId}`).set(auth(studio.token))).status).toBe(200);
    const mine = await request(app).get('/api/jobs?mine=true').set(auth(studio.token));
    expect(mine.body.jobs.map((j: { id: string }) => j.id)).toContain(jobId);
    expect((await request(app).post(`/api/jobs/${jobId}/apply`).set(auth(artist.token)).send({ message: 'late' })).status).toBe(404);
  });

  it('rejects unsafe application links', async () => {
    const res = await request(app).post('/api/jobs').set(auth(studio.token)).send({
      title: 'X', company: 'Y', workplace: 'remote', employmentType: 'freelance', description: 'Z',
      applyUrl: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
  });
});

describe('marketplace', () => {
  let seller: TestUser;
  let buyer: TestUser;
  let freeArtwork: string;
  let paidArtwork: string;
  let freeListing: string;
  let paidListing: string;
  const tag = `mkt${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    seller = await newUser();
    buyer = await newUser();
    freeArtwork = await createProcessedArtwork(seller.token, { title: 'Free crate', tags: [tag] });
    paidArtwork = await createProcessedArtwork(seller.token, { title: 'Hero sword', tags: [tag] });
  });

  it('lists artworks for free or for sale and browses them', async () => {
    const free = await request(app).put(`/api/marketplace/artworks/${freeArtwork}`).set(auth(seller.token))
      .send({ priceCents: 0, license: 'cc_by' });
    const paid = await request(app).put(`/api/marketplace/artworks/${paidArtwork}`).set(auth(seller.token))
      .send({ priceCents: 2500, license: 'commercial', description: 'Game-ready, 4K PBR' });
    expect(free.status).toBe(200);
    expect(paid.body).toMatchObject({ priceCents: 2500, license: 'commercial', isSeller: true });
    freeListing = free.body.id;
    paidListing = paid.body.id;

    // Only the artwork's owner can list it.
    expect((await request(app).put(`/api/marketplace/artworks/${paidArtwork}`).set(auth(buyer.token))
      .send({ priceCents: 1, license: 'personal' })).status).toBe(404);

    const browse = await request(app).get(`/api/marketplace?q=${tag}&sort=price_desc`);
    expect(browse.body.items.map((i: { title: string }) => i.title)).toEqual(['Hero sword', 'Free crate']);
    expect((await request(app).get(`/api/marketplace?q=${tag}&price=free`)).body.items).toHaveLength(1);

    const onArtwork = await request(app).get(`/api/marketplace/artworks/${paidArtwork}`).set(auth(buyer.token));
    expect(onArtwork.body).toMatchObject({ priceCents: 2500, isSeller: false });
  });

  it('downloads free assets and routes paid ones to the seller', async () => {
    const download = await request(app).post(`/api/marketplace/listings/${freeListing}/download`).set(auth(buyer.token));
    expect(download.status).toBe(200);
    expect(download.body.url).toMatch(/\.glb$/);
    const again = await request(app).get(`/api/marketplace/artworks/${freeArtwork}`);
    expect(again.body.downloads).toBe(1);

    expect((await request(app).post(`/api/marketplace/listings/${paidListing}/download`).set(auth(buyer.token))).status).toBe(402);

    const purchase = await request(app).post(`/api/marketplace/listings/${paidListing}/purchase-request`).set(auth(buyer.token))
      .send({ message: 'For a commercial indie game' });
    expect(purchase.status).toBe(201);
    const thread = await request(app).get(`/api/messages/${buyer.username}`).set(auth(seller.token));
    expect(thread.body.messages.at(-1).body).toContain('$25.00');
  });

  it('drops listings for artworks that are no longer public', async () => {
    await request(app).put(`/api/portfolio/artworks/${paidArtwork}`).set(auth(seller.token)).send({ visibility: 'private' });
    expect((await request(app).get(`/api/marketplace?q=${tag}`)).body.items.map((i: { title: string }) => i.title)).toEqual(['Free crate']);
    // Not for sale (or not visible) is a plain null, not an error.
    const hidden = await request(app).get(`/api/marketplace/artworks/${paidArtwork}`).set(auth(buyer.token));
    expect(hidden.status).toBe(200);
    expect(hidden.body).toBeNull();
  });
});

describe('challenges', () => {
  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let challengeId: string;
  let aliceArt: string;
  let bobArt: string;

  beforeAll(async () => {
    admin = await newUser();
    alice = await newUser();
    bob = await newUser();
    carol = await newUser();
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    aliceArt = await createProcessedArtwork(alice.token, { title: 'Alice robot' });
    bobArt = await createProcessedArtwork(bob.token, { title: 'Bob robot' });
  });

  it('only admins create challenges', async () => {
    const body = {
      title: 'Test challenge: Robots',
      brief: 'Model a robot',
      prize: 'Featured on the homepage',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect((await request(app).post('/api/challenges').set(auth(alice.token)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/challenges').set(auth(admin.token)).send({ ...body, endsAt: body.startsAt })).status).toBe(400);
    const res = await request(app).post('/api/challenges').set(auth(admin.token)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    challengeId = res.body.id;
  });

  it('takes one entry per person, from their own public artworks', async () => {
    expect((await request(app).post(`/api/challenges/${challengeId}/entries`).set(auth(alice.token)).send({ artworkId: bobArt })).status).toBe(404);
    expect((await request(app).post(`/api/challenges/${challengeId}/entries`).set(auth(alice.token)).send({ artworkId: aliceArt })).status).toBe(201);
    expect((await request(app).post(`/api/challenges/${challengeId}/entries`).set(auth(alice.token)).send({ artworkId: aliceArt })).status).toBe(409);
    expect((await request(app).post(`/api/challenges/${challengeId}/entries`).set(auth(bob.token)).send({ artworkId: bobArt })).status).toBe(201);
  });

  it('ranks entries by votes; no self-votes', async () => {
    expect((await request(app).post(`/api/challenges/${challengeId}/entries/${aliceArt}/vote`).set(auth(alice.token))).status).toBe(400);
    await request(app).post(`/api/challenges/${challengeId}/entries/${bobArt}/vote`).set(auth(alice.token));
    await request(app).post(`/api/challenges/${challengeId}/entries/${bobArt}/vote`).set(auth(carol.token));
    await request(app).post(`/api/challenges/${challengeId}/entries/${aliceArt}/vote`).set(auth(carol.token));

    const detail = await request(app).get(`/api/challenges/${challengeId}`).set(auth(carol.token));
    expect(detail.body.entries.map((e: { title: string; votes: number; rank: number }) => [e.title, e.votes, e.rank]))
      .toEqual([['Bob robot', 2, 1], ['Alice robot', 1, 2]]);
    expect(detail.body.entries.every((e: { votedByViewer: boolean }) => e.votedByViewer)).toBe(true);

    await request(app).delete(`/api/challenges/${challengeId}/entries/${bobArt}/vote`).set(auth(carol.token));
    const after = await request(app).get(`/api/challenges/${challengeId}`);
    expect(after.body.entries.find((e: { title: string }) => e.title === 'Bob robot').votes).toBe(1);
  });

  it('closes entries and voting once the challenge ends', async () => {
    await pool.query("UPDATE challenges SET ends_at = NOW() - INTERVAL '1 second', starts_at = NOW() - INTERVAL '1 day' WHERE id = $1", [challengeId]);
    const detail = await request(app).get(`/api/challenges/${challengeId}`);
    expect(detail.body.challenge.status).toBe('ended');
    expect((await request(app).post(`/api/challenges/${challengeId}/entries/${aliceArt}/vote`).set(auth(bob.token))).status).toBe(409);
    expect((await request(app).delete(`/api/challenges/${challengeId}/entries/mine`).set(auth(alice.token))).status).toBe(409);
  });
});
