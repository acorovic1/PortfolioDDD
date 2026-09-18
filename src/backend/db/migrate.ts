import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.ts';
import type { RowDataPacket } from 'mysql2';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const [rows] = await pool.query<(RowDataPacket & { name: string })[]>(
    'SELECT name FROM schema_migrations'
  );
  return new Set(rows.map(r => r.name));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

    const connection = await pool.getConnection();
    try {
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          const err = error as { code?: string };
          // Tolerate re-running the baseline migration against a database that
          // already has these tables from before migrations were tracked.
          if (err.code !== 'ER_DUP_KEYNAME') throw error;
        }
      }
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`Applied migration: ${file}`);
    } finally {
      connection.release();
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
