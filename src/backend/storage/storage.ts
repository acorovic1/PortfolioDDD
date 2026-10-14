import path from 'node:path';
import { readFile, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { recordStoredFile, forgetStoredFile } from '../repositories/storage-usage.repository.ts';

// Where uploaded files (models, renders, thumbnails, avatars, covers) live.
//
// - local (default): files stay under ./uploads and are served by Express at
//   /uploads/... (put a CDN in front of the whole site to cache them).
// - s3: files are copied to an S3-compatible bucket (AWS S3, Cloudflare R2,
//   MinIO, ...) and served from CDN_BASE_URL (or the bucket's own URL).
//
// The database stores whatever `persist` returns: "/uploads/..." for local
// files, an absolute https URL for bucket files. Everything that reads these
// URLs handles both, so existing local files keep working after switching to
// S3 (and `npm run storage:migrate` moves them over).

const LOCAL_ROOT = 'uploads';

// Upload names are random UUIDs, so a file's content never changes.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  // Served as video so browsers stream them (range requests) instead of
  // downloading.
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export function contentTypeFor(fileName: string): string {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

type S3Config = { client: S3Client; bucket: string; publicBase: string };

let s3Config: S3Config | null | undefined;

// Read lazily so env vars loaded by dotenv at startup are picked up.
function s3(): S3Config | null {
  if (s3Config !== undefined) return s3Config;
  if (process.env.STORAGE_DRIVER !== 's3') {
    s3Config = null;
    return null;
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
  const region = process.env.S3_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    // The SDK's default "flexible checksums" upload as aws-chunked, which
    // several S3-compatible stores don't decode (they store the chunk framing
    // in the file). Plain uploads work everywhere.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' }
      : undefined,
  });

  // The CDN in front of the bucket, or the bucket's own public URL.
  const publicBase = (process.env.CDN_BASE_URL
    || (endpoint
      ? `${endpoint.replace(/\/$/, '')}/${bucket}`
      : `https://${bucket}.s3.${region}.amazonaws.com`)).replace(/\/$/, '');

  s3Config = { client, bucket, publicBase };
  return s3Config;
}

// Where stored files are served from when that's not this server (the
// bucket or its CDN) - the page's content security policy has to allow it.
export function storageOrigin(): string | null {
  const config = s3();
  return config ? new URL(config.publicBase).origin : null;
}

export function storageDriver(): 'local' | 's3' {
  return s3() ? 's3' : 'local';
}

function isLocalUrl(url: string): boolean {
  return url.startsWith('/uploads/');
}

function localPathFor(url: string): string {
  // Normalize and keep it inside ./uploads.
  const relative = path.normalize(url.replace(/^\/uploads\//, ''));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid upload path');
  return path.join(LOCAL_ROOT, relative);
}

function keyFor(url: string, config: S3Config): string | null {
  return url.startsWith(`${config.publicBase}/`) ? url.slice(config.publicBase.length + 1) : null;
}

// Takes a file already written under ./uploads/<subdir>/<fileName> (by multer
// or the model pipeline) and makes it public, returning its URL.
async function putToBucket(config: S3Config, localPath: string, key: string): Promise<string> {
  const { size } = await stat(localPath);
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: createReadStream(localPath),
    ContentLength: size,
    ContentType: contentTypeFor(key),
    CacheControl: IMMUTABLE_CACHE_CONTROL,
  }));
  return `${config.publicBase}/${key}`;
}

// `ownerId` is the account whose upload it is: the file counts towards that
// account's storage quota until it's deleted.
export async function persistUpload(subdir: string, fileName: string, ownerId: string): Promise<string> {
  const config = s3();
  const localPath = path.join(LOCAL_ROOT, subdir, fileName);
  const { size } = await stat(localPath);

  let url: string;
  if (config) {
    url = await putToBucket(config, localPath, `${subdir}/${fileName}`);
    await unlink(localPath).catch(() => {});
  } else {
    url = `/uploads/${subdir}/${fileName}`;
  }
  await recordStoredFile(url, ownerId, size);
  return url;
}

// The size of a stored file, or null if it's missing or not ours.
export async function storedFileSize(url: string): Promise<number | null> {
  try {
    if (isLocalUrl(url)) return (await stat(localPathFor(url))).size;
    const config = s3();
    const key = config && keyFor(url, config);
    if (!config || !key) return null;
    const head = await config.client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

// Deletes a stored file by its public URL (local or bucket), and stops
// counting it towards its owner's quota. Missing files are fine; foreign URLs
// are ignored.
export async function deleteStoredFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  await removeStoredFile(url);
  await forgetStoredFile(url);
}

async function removeStoredFile(url: string): Promise<void> {
  if (isLocalUrl(url)) {
    try {
      await unlink(localPathFor(url));
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    return;
  }

  const config = s3();
  const key = config && keyFor(url, config);
  if (config && key) await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

// Reads a stored file (for server-side image work: resizing, link previews).
export async function readStoredFile(url: string): Promise<Buffer> {
  if (isLocalUrl(url)) return readFile(localPathFor(url));

  const config = s3();
  const key = config && keyFor(url, config);
  if (!config || !key) throw new Error('Not a stored file');
  const result = await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return Buffer.from(await result.Body!.transformToByteArray());
}

// Copies an existing local file (by its /uploads URL) to the bucket under the
// same key, keeping the local copy - the storage migration deletes it only
// once the database points at the new URL.
export async function copyLocalFileToBucket(url: string): Promise<string> {
  const config = s3();
  if (!config) throw new Error('STORAGE_DRIVER is not s3');
  return putToBucket(config, localPathFor(url), url.replace(/^\/uploads\//, ''));
}

const IMAGE_KEY = /^(renders|thumbnails|avatars|covers|images)\/[\w-]+\.(png|jpe?g|webp)$/i;

// Whether `url` is one of our stored images (local or in the bucket) - the
// image resizer only works on those, never arbitrary URLs.
export function isStoredImageUrl(url: string): boolean {
  if (isLocalUrl(url)) return IMAGE_KEY.test(url.slice('/uploads/'.length));
  const config = s3();
  const key = config && keyFor(url, config);
  return !!key && IMAGE_KEY.test(key);
}

// For tests.
export function resetStorageConfig(): void {
  s3Config = undefined;
}
