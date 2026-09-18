import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { unlink, mkdir } from 'node:fs/promises';

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

const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export const uploadModel = multer({
  storage: makeStorage('models'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MODEL_EXTENSIONS.has(ext)) {
      cb(new Error('Only .glb or .gltf files are allowed'));
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

export function toPublicPath(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

export async function deletePublicFile(publicPath: string): Promise<void> {
  const diskPath = path.join('uploads', publicPath.replace(/^\/uploads\//, ''));
  try {
    await unlink(diskPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}
