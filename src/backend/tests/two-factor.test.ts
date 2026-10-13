import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { pool } from '../config/db.ts';
import { outbox } from '../services/mail.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import {
  base32Encode, base32Decode, totpCode, verifyTotp, currentStep, encryptSecret, decryptSecret,
} from '../utils/totp.util.ts';

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

// Turns two-factor on; returns the secret, recovery codes and the new token.
async function enable(token: string) {
  const setup = await request(app).post('/api/auth/2fa/setup').set(auth(token));
  expect(setup.status).toBe(200);
  expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
  expect(setup.body.otpauthUrl).toContain(`secret=${setup.body.secret}`);

  const secret: string = setup.body.secret;
  const res = await request(app).post('/api/auth/2fa/enable').set(auth(token))
    .send({ code: totpCode(secret, currentStep()) });
  expect(res.status).toBe(200);
  return { secret, recoveryCodes: res.body.recoveryCodes as string[], token: res.body.token as string };
}

describe('TOTP', () => {
  it('matches the RFC 6238 reference values', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    // T = 59s and 1111111109s (last 6 digits of the 8-digit RFC values)
    expect(totpCode(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });

  it('accepts one step of clock drift and refuses replays', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, totpCode(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step + 2), null, now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), step, now)).toBeNull();
  });

  it('encrypts secrets at rest', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored)).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('two-factor sign-in', () => {
  it('needs a code after the password once it is on', async () => {
    const user = await register();
    const { secret, token } = await enable(user.token);

    const stored = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [user.id]);
    expect(stored.rows[0].totp_secret).not.toContain(secret);
    expect((await request(app).get('/api/auth/me').set(auth(token))).body.twoFactorEnabled).toBe(true);
    expect(outbox.some(m => m.to === user.email && m.subject.includes('enabled'))).toBe(true);

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeUndefined();
    expect(login.body.twoFactorRequired).toBe(true);

    // The challenge isn't a session.
    expect((await request(app).get('/api/auth/me').set(auth(login.body.challengeToken))).status).toBe(403);

    const wrong = await request(app).post('/api/auth/login/2fa')
      .send({ challengeToken: login.body.challengeToken, code: '000000' });
    expect(wrong.status).toBe(401);

    // The enabling code's step is used up, so the next step's code it is.
    const code = totpCode(secret, currentStep() + 1);
    const ok = await request(app).post('/api/auth/login/2fa')
      .send({ challengeToken: login.body.challengeToken, code });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(ok.body.token))).status).toBe(200);

    // The same code can't be used twice.
    const again = await request(app).post('/api/auth/login/2fa')
      .send({ challengeToken: login.body.challengeToken, code });
    expect(again.status).toBe(401);
  });

  it('recovery codes work once each', async () => {
    const user = await register();
    const { recoveryCodes } = await enable(user.token);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);

    const challenge = async () => (await request(app).post('/api/auth/login')
      .send({ email: user.email, password: user.password })).body.challengeToken;

    const first = await request(app).post('/api/auth/login/2fa')
      .send({ challengeToken: await challenge(), code: recoveryCodes[0].toUpperCase() });
    expect(first.status).toBe(200);
    expect(first.body.usedRecoveryCode).toBe(true);

    const reused = await request(app).post('/api/auth/login/2fa')
      .send({ challengeToken: await challenge(), code: recoveryCodes[0] });
    expect(reused.status).toBe(401);

    const status = await request(app).get('/api/auth/2fa').set(auth(first.body.token));
    expect(status.body).toMatchObject({ enabled: true, recoveryCodesLeft: 9 });
  });

  it('turning it off needs the password and a code', async () => {
    const user = await register();
    const { secret, token } = await enable(user.token);
    const code = totpCode(secret, currentStep() + 1);

    const badPassword = await request(app).post('/api/auth/2fa/disable').set(auth(token))
      .send({ password: 'wrong-password', code });
    expect(badPassword.status).toBe(401);
    const badCode = await request(app).post('/api/auth/2fa/disable').set(auth(token))
      .send({ password: user.password, code: '123456' });
    expect(badCode.status).toBe(401);

    const ok = await request(app).post('/api/auth/2fa/disable').set(auth(token))
      .send({ password: user.password, code });
    expect(ok.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(login.body.token).toBeTruthy();
  });

  it('a wrong code during setup leaves it off', async () => {
    const user = await register();
    await request(app).post('/api/auth/2fa/setup').set(auth(user.token));
    const res = await request(app).post('/api/auth/2fa/enable').set(auth(user.token)).send({ code: '000000' });
    expect(res.status).toBe(400);
    expect((await request(app).get('/api/auth/2fa').set(auth(user.token))).body.enabled).toBe(false);
  });
});

describe('sessions', () => {
  it('turning on two-factor signs out other sessions', async () => {
    const user = await register();
    const other = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;
    const { token } = await enable(user.token);

    const revoked = await request(app).get('/api/auth/me').set(auth(other));
    expect(revoked.status).toBe(401);
    expect(revoked.body.sessionRevoked).toBe(true);
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
  });

  it('resetting the password from the emailed link signs out every session', async () => {
    const user = await register();
    const other = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;

    const before = outbox.length;
    expect((await request(app).post('/api/auth/password-reset-link').set(auth(user.token))).status).toBe(200);
    const mail = outbox.slice(before).find(m => m.to === user.email);
    const token = mail?.text.match(/\/reset-password\?token=([a-f0-9]{64})/)?.[1];

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'another-password' });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set(auth(other))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).status).toBe(401);
  });

  it('"sign out everywhere" revokes every token but the new one', async () => {
    const user = await register();
    const res = await request(app).post('/api/auth/logout-everywhere').set(auth(user.token));
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(user.token))).status).toBe(401);

    // Refreshing keeps the current version.
    const refreshed = await request(app).post('/api/auth/refresh').set(auth(res.body.token));
    expect((await request(app).get('/api/auth/me').set(auth(refreshed.body.token))).status).toBe(200);
  });
});
