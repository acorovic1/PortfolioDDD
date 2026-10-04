import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

const DB_CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  // Postgres SQLSTATEs for a server that is shutting down or still starting up.
  '57P01',
  '57P03',
]);

export function isDbConnectionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (typeof code !== 'string') return false;
  // SQLSTATE class 08 covers every "connection exception".
  return DB_CONNECTION_ERROR_CODES.has(code) || code.startsWith('08');
}
