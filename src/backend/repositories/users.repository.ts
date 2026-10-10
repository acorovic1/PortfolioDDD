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
    | 'availableForWork' | 'workTypes' | 'experience' | 'emailNotifications'>>
): Promise<void> {
  const columnMap: Record<string, string> = {
    coverUrl: 'cover_url',
    website: 'website',
    socialLinks: 'social_links',
    availableForWork: 'available_for_work',
    workTypes: 'work_types',
    experience: 'experience',
    emailNotifications: 'email_notifications',
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

export async function updateUsername(id: string, username: string): Promise<void> {
  await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, id]);
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
