import { beforeAll } from 'vitest';
import { runMigrations } from '../db/migrate.ts';

// Tests read sent mail from the in-memory outbox (services/mail.ts), so they
// never use a real SMTP server configured in .env. Set before dotenv runs,
// which doesn't override variables that already exist.
process.env.SMTP_URL = '';
process.env.SMTP_HOST = '';

beforeAll(async () => {
  await runMigrations();
}, 20000);
