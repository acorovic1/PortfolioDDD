import { open } from 'node:fs/promises';
import path from 'node:path';
import { VIDEO_EXTENSIONS } from './upload.util.ts';

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

// Whether the file really is an MP4 (an ISO media file: a box called 'ftyp'
// right at the start) or a WebM (an EBML header) - the extension alone
// proves nothing, and the file is served as is.
export async function looksLikeVideo(filePath: string): Promise<boolean> {
  const file = await open(filePath, 'r');
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await file.read(head, 0, 12, 0);
    if (bytesRead < 12) return false;
    const isMp4 = head.toString('latin1', 4, 8) === 'ftyp';
    const isWebm = head.readUInt32BE(0) === 0x1a45dfa3;
    return isMp4 || isWebm;
  } finally {
    await file.close();
  }
}
