import { pool } from '../config/db.ts';
import type { UserRecord, PublicUser } from '../types.ts';
import { parseJsonArray } from '../utils/json.util.ts';

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    title: row.title,
    bio: row.bio,
    location: row.location,
    github: row.github,
    linkedin: row.linkedin,
    skills: parseJsonArray(row.skills),
    showMature: row.show_mature,
    hideAi: row.hide_ai,
    noAiTraining: row.no_ai_training,
    role: row.role,
    coverUrl: row.cover_url,
    website: row.website,
    socialLinks: row.social_links ?? {},
    availableForWork: row.available_for_work,
    workTypes: row.work_types ?? [],
    experience: row.experience ?? [],
    emailVerified: row.email_verified_at !== null,
    emailNotifications: row.email_notifications,
    twoFactorEnabled: row.totp_enabled_at !== null,
    locale: row.locale,
  };
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function findUserByEmailOrUsername(email: string, username: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    'SELECT * FROM users WHERE email = $1 OR username = $2 LIMIT 1',
    [email, username]
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    'SELECT * FROM users WHERE username = $1 LIMIT 1',
    [username]
  );
  return rows[0] ?? null;
}

export type UserSearchResult = Pick<PublicUser, 'id' | 'username' | 'name' | 'avatarUrl' | 'title'>;

// Only public profile fields: search used to return full user rows,
// including other people's email addresses. Matching on email is kept so
// people can still be found by it, it's just never sent back.
export async function searchUsers(query: string, limit: number, offset: number): Promise<UserSearchResult[]> {
  const like = `%${query}%`;
  const { rows } = await pool.query<UserRecord>(
    `SELECT * FROM users WHERE username ILIKE $1 OR name ILIKE $1 OR email ILIKE $1 LIMIT $2 OFFSET $3`,
    [like, limit, offset]
  );
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    title: row.title,
  }));
}

export async function createUser(user: {
  id: string;
  email: string;
  username: string;
  name: string;
  passwordHash: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, username, name, password_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, user.email, user.username, user.name, user.passwordHash]
  );
}

export async function updateUserProfile(
  id: string,
  fields: Partial<Pick<PublicUser,
    'avatarUrl' | 'title' | 'bio' | 'location' | 'github' | 'linkedin' | 'skills' | 'name'
    | 'showMature' | 'hideAi' | 'noAiTraining' | 'coverUrl' | 'website' | 'socialLinks'
    | 'availableForWork' | 'workTypes' | 'experience' | 'emailNotifications' | 'locale'>>
): Promise<void> {
  const columnMap: Record<string, string> = {
    coverUrl: 'cover_url',
    website: 'website',
    socialLinks: 'social_links',
    availableForWork: 'available_for_work',
    workTypes: 'work_types',
    experience: 'experience',
    emailNotifications: 'email_notifications',
    locale: 'locale',
    showMature: 'show_mature',
    hideAi: 'hide_ai',
    noAiTraining: 'no_ai_training',
    avatarUrl: 'avatar_url',
    title: 'title',
    bio: 'bio',
    location: 'location',
    github: 'github',
    linkedin: 'linkedin',
    skills: 'skills',
    name: 'name',
  };

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const setClause = entries.map(([key], i) => `${columnMap[key]} = $${i + 1}`).join(', ');
  const jsonColumns = new Set(['skills', 'socialLinks', 'experience']);
  const values = entries.map(([key, value]) => (jsonColumns.has(key) ? JSON.stringify(value) : value));

  await pool.query(`UPDATE users SET ${setClause} WHERE id = $${values.length + 1}`, [...values, id]);
}

// How long an abandoned username stays reserved for its previous owner.
export const USERNAME_RESERVATION_DAYS = 180;

// Renames, remembering the old name so its links redirect here.
export async function updateUsername(id: string, username: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ username: string }>(
      'SELECT username FROM users WHERE id = $1 FOR UPDATE',
      [id]
    );
    const previous = rows[0]?.username;
    if (previous && previous !== username) {
      await client.query('UPDATE users SET username = $1 WHERE id = $2', [username, id]);
      await client.query(
        `INSERT INTO username_history (old_username, user_id) VALUES ($1, $2)
         ON CONFLICT (old_username) DO UPDATE SET user_id = EXCLUDED.user_id, changed_at = NOW()`,
        [previous, id]
      );
      // The new name is in use again, so it no longer redirects anywhere.
      await client.query('DELETE FROM username_history WHERE old_username = $1', [username]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The account that used to be called `username`, if it was renamed.
export async function findRenamedUser(username: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    `SELECT u.* FROM username_history h JOIN users u ON u.id = h.user_id
     WHERE h.old_username = $1 LIMIT 1`,
    [username]
  );
  return rows[0] ?? null;
}

// True while `username` is someone else's recently abandoned name.
export async function isUsernameReserved(username: string, forUserId: string | null): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM username_history
     WHERE old_username = $1 AND ($2::text IS NULL OR user_id <> $2)
       AND changed_at > NOW() - make_interval(days => $3)`,
    [username, forUserId, USERNAME_RESERVATION_DAYS]
  );
  return rows.length > 0;
}

// A new address has to be verified again.
export async function updateEmail(id: string, email: string): Promise<void> {
  await pool.query(
    `UPDATE users SET email = $1, email_verified_at = NULL, email_verify_token_hash = NULL, email_verify_expires = NULL
     WHERE id = $2`,
    [email, id]
  );
}

export async function setEmailVerifyToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await pool.query(
    'UPDATE users SET email_verify_token_hash = $1, email_verify_expires = $2 WHERE id = $3',
    [tokenHash, expiresAt, id]
  );
}

// Verifies whichever account the token belongs to; null when it's unknown or expired.
export async function verifyEmailByTokenHash(tokenHash: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    `UPDATE users
     SET email_verified_at = NOW(), email_verify_token_hash = NULL, email_verify_expires = NULL
     WHERE email_verify_token_hash = $1 AND email_verify_expires > NOW()
     RETURNING *`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function markEmailVerified(id: string): Promise<void> {
  await pool.query(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
    [id]
  );
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

export async function deleteUser(id: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

export async function setResetToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await pool.query(
    'UPDATE users SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3',
    [tokenHash, expiresAt, id]
  );
}

export async function findUserByResetTokenHash(tokenHash: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>(
    'SELECT * FROM users WHERE reset_token_hash = $1 AND reset_token_expires > NOW() LIMIT 1',
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function clearResetToken(id: string): Promise<void> {
  await pool.query('UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE id = $1', [id]);
}

// Signs out every session (their tokens carry the old version). Returns the new version.
export async function bumpTokenVersion(id: string): Promise<number> {
  const { rows } = await pool.query<{ token_version: number }>(
    'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
    [id]
  );
  return rows[0]?.token_version ?? 0;
}

export async function setPendingTotpSecret(id: string, encryptedSecret: string): Promise<void> {
  await pool.query('UPDATE users SET totp_pending_secret = $1 WHERE id = $2', [encryptedSecret, id]);
}

export async function enableTotp(id: string, encryptedSecret: string, step: number, recoveryHashes: string[]): Promise<void> {
  await pool.query(
    `UPDATE users
     SET totp_secret = $1, totp_pending_secret = NULL, totp_enabled_at = NOW(), totp_last_step = $2,
         totp_recovery_hashes = $3
     WHERE id = $4`,
    [encryptedSecret, step, JSON.stringify(recoveryHashes), id]
  );
}

export async function disableTotp(id: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
         totp_recovery_hashes = '[]'::jsonb
     WHERE id = $1`,
    [id]
  );
}

// Records a used code's step - only if it's newer than the last one, so two
// requests racing with the same code can't both succeed.
export async function claimTotpStep(id: string, step: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE users SET totp_last_step = $1 WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)',
    [step, id]
  );
  return rowCount === 1;
}

// Removes a recovery code; false when it isn't (or is no longer) valid.
export async function consumeRecoveryCode(id: string, codeHash: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE users SET totp_recovery_hashes = totp_recovery_hashes - $1
     WHERE id = $2 AND totp_recovery_hashes ? $1`,
    [codeHash, id]
  );
  return rowCount === 1;
}

export async function setRecoveryCodes(id: string, recoveryHashes: string[]): Promise<void> {
  await pool.query('UPDATE users SET totp_recovery_hashes = $1 WHERE id = $2', [JSON.stringify(recoveryHashes), id]);
}
