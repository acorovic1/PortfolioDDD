import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.ts';
import { encryptText, encryptMeta, isEncryptedText } from '../utils/message-crypto.util.ts';

// Usage: npm run messages:encrypt
// Encrypts messages stored before encryption at rest existed. New messages
// are encrypted on write; old ones are readable either way, so this is safe
// to run (and re-run) at any time. Run it with the same MESSAGE_ENCRYPTION_KEY
// (or JWT_SECRET) as the server.
async function main(): Promise<void> {
  const { rows } = await pool.query<{ id: string; body: string; meta: Record<string, unknown> | null }>(
    `SELECT id, body, meta FROM messages WHERE body NOT LIKE 'm1:%'`
  );

  let updated = 0;
  for (const row of rows) {
    if (isEncryptedText(row.body)) continue;
    const meta = row.meta && typeof row.meta.enc !== 'string' ? encryptMeta(row.meta) : row.meta && JSON.stringify(row.meta);
    await pool.query('UPDATE messages SET body = $2, meta = $3 WHERE id = $1', [row.id, encryptText(row.body), meta]);
    updated++;
  }
  console.log(`Encrypted ${updated} message${updated === 1 ? '' : 's'}`);
  await pool.end();
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
