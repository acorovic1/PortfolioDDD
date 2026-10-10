import { describe, it, expect, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { app } from '../app.ts';
import { normalizeDomain, setTxtResolver, clearDomainCache } from '../services/custom-domains.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

afterEach(() => {
  setTxtResolver(null);
  clearDomainCache();
});

async function register() {
  const user = await registerTestUser();
  createdUserIds.push(user.id);
  return user;
}

const uniqueDomain = () => `portfolio-${crypto.randomUUID().slice(0, 8)}.example.com`;

// Fake DNS: `records` maps TXT names to their values (split like real DNS can).
function fakeDns(records: Record<string, string[][]>) {
  setTxtResolver(async (name) => {
    if (records[name]) return records[name];
    throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  });
}

async function connectAndVerify(token: string, domain: string) {
  const claimed = await request(app).put('/api/users/me/domain').set(auth(token)).send({ domain });
  expect(claimed.status).toBe(200);
  const { name, value } = claimed.body.txtRecord;
  fakeDns({ [name]: [[value.slice(0, 20), value.slice(20)]] });
  const verified = await request(app).post('/api/users/me/domain/verify').set(auth(token));
  expect(verified.status).toBe(200);
  return verified.body;
}

describe('normalizeDomain', () => {
  it('accepts hostnames and strips the rest', () => {
    expect(normalizeDomain('https://Portfolio.Example.com/about?x=1')).toBe('portfolio.example.com');
    expect(normalizeDomain('jane.art.')).toBe('jane.art');
    expect(normalizeDomain('jane.art:8080')).toBe('jane.art');
  });

  it('rejects things that are not public hostnames', () => {
    for (const bad of ['localhost', 'nodots', '127.0.0.1', 'a..b.com', '-bad.com', 'x.localhost', 'has space.com']) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });
});

describe('custom domains', () => {
  it('goes live only once the TXT record checks out', async () => {
    const user = await register();
    const domain = uniqueDomain();

    const claimed = await request(app).put('/api/users/me/domain').set(auth(user.token)).send({ domain: `https://${domain}/` });
    expect(claimed.body).toMatchObject({ domain, verified: false });
    expect(claimed.body.txtRecord.name).toBe(`_portfolioddd.${domain}`);
    expect(claimed.body.txtRecord.value).toMatch(/^portfolioddd-verification=[a-f0-9]{32}$/);

    expect((await request(app).get('/api/domains/check').query({ domain })).status).toBe(404);

    fakeDns({ [`_portfolioddd.${domain}`]: [['portfolioddd-verification=wrong']] });
    const wrong = await request(app).post('/api/users/me/domain/verify').set(auth(user.token));
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toContain('TXT record');

    fakeDns({ [claimed.body.txtRecord.name]: [[claimed.body.txtRecord.value]] });
    const ok = await request(app).post('/api/users/me/domain/verify').set(auth(user.token));
    expect(ok.body.verified).toBe(true);
    expect((await request(app).get('/api/domains/check').query({ domain })).status).toBe(200);
  });

  it('one domain per account', async () => {
    const first = await register();
    const domain = uniqueDomain();
    await request(app).put('/api/users/me/domain').set(auth(first.token)).send({ domain });

    const second = await register();
    const res = await request(app).put('/api/users/me/domain').set(auth(second.token)).send({ domain });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('another account');
  });

  it('allows API calls from verified domains only (CORS)', async () => {
    const user = await register();
    const domain = uniqueDomain();
    const origin = `https://${domain}`;
    const corsHeader = async () =>
      (await request(app).get('/api/health').set('Origin', origin)).headers['access-control-allow-origin'];

    expect(await corsHeader()).toBeUndefined();
    await connectAndVerify(user.token, domain);
    clearDomainCache();
    expect(await corsHeader()).toBe(origin);
  });

  it('disconnecting takes it offline', async () => {
    const user = await register();
    const domain = uniqueDomain();
    await connectAndVerify(user.token, domain);

    const removed = await request(app).delete('/api/users/me/domain').set(auth(user.token));
    expect(removed.body).toEqual({ domain: null });
    expect((await request(app).get('/api/domains/check').query({ domain })).status).toBe(404);
  });

  it.skipIf(!existsSync('dist/index.html'))("serves the artist's profile at the domain's root", async () => {
    const user = await register();
    const domain = uniqueDomain();
    await connectAndVerify(user.token, domain);

    const page = await request(app).get('/').set('Host', domain);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`<meta name="portfolio-domain-owner" content="${user.username}" />`);
    expect(page.text).toContain(`<title>@${user.username}`);
    expect(page.text).toContain(`<link rel="canonical" href="http://${domain}/" />`);

    // Unverified/unknown hosts get the normal site.
    const other = await request(app).get('/').set('Host', uniqueDomain());
    expect(other.text).not.toContain('portfolio-domain-owner');
  });
});
