import { pool } from '../config/db.ts';
import type { UserRecord, PublicUser } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
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
  };
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function findUserByEmailOrUsername(email: string, username: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
    [email, username]
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] ?? null;
}

export async function searchUsers(query: string, limit: number, offset: number): Promise<PublicUser[]> {
  const like = `%${query}%`;
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    `SELECT * FROM users WHERE username LIKE ? OR name LIKE ? OR email LIKE ? LIMIT ? OFFSET ?`,
    [like, like, like, limit, offset]
  );
  return rows.map(toPublicUser);
}

export async function createUser(user: {
  id: string;
  email: string;
  username: string;
  name: string;
  passwordHash: string;
}): Promise<void> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO users (id, email, username, name, password_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.email, user.username, user.name, user.passwordHash]
  );
}

export async function updateUserProfile(
  id: string,
  fields: Partial<Pick<PublicUser, 'avatarUrl' | 'title' | 'bio' | 'location' | 'github' | 'linkedin' | 'skills' | 'name'>>
): Promise<void> {
  const columnMap: Record<string, string> = {
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

  const setClause = entries.map(([key]) => `${columnMap[key]} = ?`).join(', ');
  const values = entries.map(([key, value]) => (key === 'skills' ? JSON.stringify(value) : value));

  await pool.query(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]);
}

export async function updateUsername(id: string, username: string): Promise<void> {
  await pool.query('UPDATE users SET username = ? WHERE id = ?', [username, id]);
}

export async function updateEmail(id: string, email: string): Promise<void> {
  await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, id]);
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}

export async function deleteUser(id: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
}

export async function setResetToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await pool.query(
    'UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?',
    [tokenHash, expiresAt, id]
  );
}

export async function findUserByResetTokenHash(tokenHash: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<(UserRecord & RowDataPacket)[]>(
    'SELECT * FROM users WHERE reset_token_hash = ? AND reset_token_expires > NOW() LIMIT 1',
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function clearResetToken(id: string): Promise<void> {
  await pool.query('UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?', [id]);
}
