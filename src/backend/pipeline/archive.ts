import AdmZip from 'adm-zip';
import path from 'node:path';
import { mkdir, writeFile, readdir } from 'node:fs/promises';

// Guards against zip bombs: limits on entry count, total extracted size, and
// the size of any one file (each is inflated in memory, so this bounds RAM).
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;

export class ArchiveError extends Error {}

// Whether `target` is `root` itself or somewhere below it.
export function isInside(root: string, target: string): boolean {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved === base || resolved.startsWith(base + path.sep);
}

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
    if (!isInside(root, target)) {
      throw new ArchiveError('The .zip contains an invalid file path');
    }

    // Check the declared size before inflating (adm-zip never inflates past
    // it), then the real size after.
    if (entry.header.size > MAX_ENTRY_BYTES) {
      throw new ArchiveError(`A file in the .zip is too large once extracted (max ${MAX_ENTRY_BYTES / 1024 / 1024} MB each)`);
    }
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
