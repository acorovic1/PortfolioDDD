import crypto from 'node:crypto';

// A random single-use token for an emailed link. Only its hash is stored, so
// a leaked database can't be used to take over accounts.
export function createEmailToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashEmailToken(token) };
}

export function hashEmailToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
