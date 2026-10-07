import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.ts';

// Usage: npm run make-admin -- someone@example.com   (or a username)
// Grants the admin role, which unlocks the moderation page (/admin).
async function main(): Promise<void> {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: npm run make-admin -- <email or username>');
    process.exit(1);
  }

  const { rows } = await pool.query<{ username: string }>(
    // Emails are stored lowercase.
    `UPDATE users SET role = 'admin' WHERE email = LOWER($1) OR username = $1 RETURNING username`,
    [identifier.trim()]
  );
  if (rows.length === 0) {
    console.error(`No user found for "${identifier}"`);
    process.exit(1);
  }
  console.log(`@${rows[0].username} is now an admin`);
  await pool.end();
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
