import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { unlink, mkdir } from 'node:fs/promises';
import { UPLOAD_EXTENSIONS } from '../pipeline/formats.ts';

function makeStorage(subdir: string) {
  const dir = path.join('uploads', subdir);
  return multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (error) {
        cb(error as Error, dir);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const MAX_MODEL_UPLOAD_BYTES = (Number(process.env.MAX_MODEL_UPLOAD_MB) || 300) * 1024 * 1024;

// Raw model uploads (any supported format, or a .zip bundle). They're kept in
// uploads/sources only until the processing pipeline has converted them.
export const uploadModel = multer({
  storage: makeStorage('sources'),
  limits: { fileSize: MAX_MODEL_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) {
      cb(new Error(`Unsupported model format. Allowed: ${[...UPLOAD_EXTENSIONS].join(', ')}`));
      return;
    }
    cb(null, true);
  },
});

export const uploadImage = multer({
  storage: makeStorage('renders'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new Error('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadAvatar = multer({
  storage: makeStorage('avatars'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new Error('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadThumbnail = multer({
  storage: makeStorage('thumbnails'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new Error('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function toPublicPath(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

export async function deletePublicFile(publicPath: string | null | undefined): Promise<void> {
  // Artworks have no model file until their first upload finishes processing.
  if (!publicPath) return;
  const diskPath = path.join('uploads', publicPath.replace(/^\/uploads\//, ''));
  try {
    await unlink(diskPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}
