import crypto from 'node:crypto';

// --- Messages at rest ---
// Message bodies and hire-request details are encrypted with AES-256-GCM
// before they reach the database, so a leaked dump or backup doesn't expose
// private conversations. (The server can still read them - this is not
// end-to-end encryption.) The key comes from MESSAGE_ENCRYPTION_KEY, falling
// back to JWT_SECRET; set the dedicated key in production so rotating the JWT
// secret doesn't make old messages unreadable.

const PREFIX = 'm1:';

function encryptionKey(): Buffer {
  const material = process.env.MESSAGE_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!material) throw new Error('MESSAGE_ENCRYPTION_KEY or JWT_SECRET is required');
  return crypto.createHash('sha256').update(`messages:${material}`).digest();
}

export function isEncryptedText(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

// Rows written before encryption existed are plain text and pass through.
export function decryptText(stored: string): string {
  if (!isEncryptedText(stored)) return stored;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// The JSONB meta column holds { enc: "<ciphertext>" } once encrypted.
export function encryptMeta(meta: Record<string, unknown> | null | undefined): string | null {
  return meta ? JSON.stringify({ enc: encryptText(JSON.stringify(meta)) }) : null;
}

export function decryptMeta(stored: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!stored) return null;
  if (typeof stored.enc === 'string') return JSON.parse(decryptText(stored.enc)) as Record<string, unknown>;
  return stored;
}
