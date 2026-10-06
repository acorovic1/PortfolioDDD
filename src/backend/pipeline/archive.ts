import AdmZip from 'adm-zip';
import path from 'node:path';
import { mkdir, writeFile, readdir } from 'node:fs/promises';

// Guards against zip bombs: limits on entry count and total extracted size.
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export class ArchiveError extends Error {}

// Extracts `zipPath` into `destDir`, rejecting entries that would escape it
// (zip-slip) and skipping OS metadata like __MACOSX/.
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new ArchiveError('The uploaded .zip file could not be read');
  }

  const entries = zip.getEntries().filter(entry => !entry.isDirectory);
  if (entries.length > MAX_ENTRIES) {
    throw new ArchiveError(`The .zip contains too many files (max ${MAX_ENTRIES})`);
  }

  const root = path.resolve(destDir);
  let totalBytes = 0;

  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('__MACOSX/') || path.posix.basename(name).startsWith('._')) continue;

    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new ArchiveError('The .zip contains an invalid file path');
    }

    // Check the declared size before inflating, then the real size after
    // (the header can lie).
    if (totalBytes + entry.header.size > MAX_TOTAL_BYTES) {
      throw new ArchiveError('The .zip is too large once extracted');
    }
    const data = entry.getData();
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new ArchiveError('The .zip is too large once extracted');
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}

// All files under `dir`, as paths relative to it.
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)));
}
