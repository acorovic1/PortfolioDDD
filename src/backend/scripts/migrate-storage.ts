import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { pool } from '../config/db.ts';
import { storageDriver, copyLocalFileToBucket, deleteStoredFile } from '../storage/storage.ts';
import { renameStoredFile } from '../repositories/storage-usage.repository.ts';

// Usage (with STORAGE_DRIVER=s3 and the S3_* settings in .env):
//   npm run storage:migrate
// Copies every file still stored locally (/uploads/...) to the bucket,
// points the database at the new URL, then deletes the local copy - one file
// at a time, so it's safe to stop and re-run.

const COLUMNS: [table: string, idColumn: string, urlColumn: string][] = [
  ['artworks', 'id', 'model_path'],
  ['artworks', 'id', 'thumbnail_path'],
  ['artworks', 'id', 'image_path'],
  ['renders', 'id', 'url'],
  ['users', 'id', 'avatar_url'],
  ['users', 'id', 'cover_url'],
];

async function main(): Promise<void> {
  dotenv.config();
  if (storageDriver() !== 's3') {
    console.error('Set STORAGE_DRIVER=s3 (and the S3_* settings) first.');
    process.exit(1);
  }

  let moved = 0;
  let failed = 0;
  for (const [table, idColumn, urlColumn] of COLUMNS) {
    const { rows } = await pool.query<{ id: string; url: string }>(
      `SELECT ${idColumn} AS id, ${urlColumn} AS url FROM ${table} WHERE ${urlColumn} LIKE '/uploads/%'`
    );
    for (const row of rows) {
      try {
        const newUrl = await copyLocalFileToBucket(row.url);
        await pool.query(`UPDATE ${table} SET ${urlColumn} = $1 WHERE ${idColumn} = $2 AND ${urlColumn} = $3`, [newUrl, row.id, row.url]);
        // Still the owner's file (and storage), at its new URL.
        await renameStoredFile(row.url, newUrl);
        await deleteStoredFile(row.url);
        moved++;
      } catch (error) {
        failed++;
        console.error(`Couldn't move ${row.url}:`, (error as Error).message);
      }
    }
  }

  console.log(`Moved ${moved} file(s) to the bucket${failed ? `, ${failed} failed (re-run to retry)` : ''}.`);
  await pool.end();
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
