import { beforeAll } from 'vitest';
import { runMigrations } from '../db/migrate.ts';

beforeAll(async () => {
  await runMigrations();
}, 20000);
