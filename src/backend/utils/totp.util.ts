import crypto from 'node:crypto';

// Time-based one-time passwords (RFC 6238) - the 6-digit codes from
// authenticator apps (Google Authenticator, 1Password, Authy...): an
// HMAC-SHA1 of the current 30-second step, keyed with a shared secret.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

// The step a code belongs to (one step either side allows for clock drift),
// or null. Steps at or before `lastUsedStep` are refused, so an intercepted
// code can't be replayed.
export function verifyTotp(secret: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const candidate of [step, step - 1, step + 1]) {
    if (lastUsedStep !== null && candidate <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, candidate));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return candidate;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// --- Secrets at rest ---
// TOTP secrets have to be readable (unlike passwords), so they're encrypted
// with AES-256-GCM. The key comes from TOTP_ENCRYPTION_KEY, falling back to
// JWT_SECRET.

function encryptionKey(): Buffer {
  const material = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!material) throw new Error('TOTP_ENCRYPTION_KEY or JWT_SECRET is required');
  return crypto.createHash('sha256').update(`totp:${material}`).digest();
}

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1') throw new Error('Unknown secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// --- Recovery codes ---
// Ten single-use "xxxxx-xxxxx" codes for when the authenticator is lost.
// They're random enough that a plain SHA-256 is a fine way to store them.

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.toLowerCase().replace(/[^a-z2-7]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
