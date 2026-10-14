import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { UPLOAD_EXTENSIONS } from '../pipeline/formats.ts';

// A file refused by an upload's filter; its message is shown to the user.
export class UploadRejectedError extends Error {}

// `subdir` can depend on the form field, for uploads with several files.
function makeStorage(subdir: string | ((fieldname: string) => string)) {
  return multer.diskStorage({
    destination: async (_req, file, cb) => {
      const dir = path.join('uploads', typeof subdir === 'string' ? subdir : subdir(file.fieldname));
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
// Stored as uploaded (there's no transcoding), so only formats browsers play.
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

// Per-file size caps. Everything an account stores also counts towards its
// storage quota (services/storage-quota.ts).
const MB = 1024 * 1024;
// Renders (images), covers, avatars, thumbnails and video posters.
const MAX_SMALL_IMAGE_BYTES = 5 * MB;

const MAX_MODEL_UPLOAD_BYTES = (Number(process.env.MAX_MODEL_UPLOAD_MB) || 50) * MB;

// Raw model uploads (any supported format, or a .zip bundle). They're kept in
// uploads/sources only until the processing pipeline has converted them.
export const uploadModel = multer({
  storage: makeStorage('sources'),
  limits: { fileSize: MAX_MODEL_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError(`Unsupported model format. Allowed: ${[...UPLOAD_EXTENSIONS].join(', ')}`));
      return;
    }
    cb(null, true);
  },
});

const MAX_ARTWORK_IMAGE_BYTES = (Number(process.env.MAX_IMAGE_UPLOAD_MB) || 10) * MB;

// The image of a 2D artwork - kept at full size, since viewers can zoom in
// to single pixels.
export const uploadArtworkImage = multer({
  storage: makeStorage('images'),
  limits: { fileSize: MAX_ARTWORK_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Video artworks and video renders.
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_UPLOAD_MB) || 30) * MB;
// Posters and render images arrive in the same request as a video (with the
// video's size limit), so the controllers check them against this.
export const MAX_POSTER_BYTES = MAX_SMALL_IMAGE_BYTES;
export const MAX_RENDER_IMAGE_BYTES = MAX_SMALL_IMAGE_BYTES;

// A video artwork: the video, plus a frame the browser grabbed from it
// ('poster', made into the thumbnail and then discarded).
export const uploadArtworkVideo = multer({
  storage: makeStorage(field => (field === 'video' ? 'videos' : 'sources')),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'video' && !VIDEO_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only video files (mp4, webm) are allowed'));
      return;
    }
    if (file.fieldname === 'poster' && !IMAGE_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('The poster must be an image (png, jpg, jpeg, webp)'));
      return;
    }
    cb(null, true);
  },
});

// A render: an image, or a video (an animation, a turntable, ...).
export const uploadRender = multer({
  storage: makeStorage('renders'),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only images (png, jpg, jpeg, webp) and videos (mp4, webm) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadAvatar = multer({
  storage: makeStorage('avatars'),
  limits: { fileSize: MAX_SMALL_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadCover = multer({
  storage: makeStorage('covers'),
  limits: { fileSize: MAX_SMALL_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadThumbnail = multer({
  storage: makeStorage('thumbnails'),
  limits: { fileSize: MAX_SMALL_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      cb(new UploadRejectedError('Only image files (png, jpg, jpeg, webp) are allowed'));
      return;
    }
    cb(null, true);
  },
});
