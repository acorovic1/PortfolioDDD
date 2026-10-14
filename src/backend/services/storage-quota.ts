import type { Request, Response, NextFunction } from 'express';
import { rm } from 'node:fs/promises';
import type { AuthRequest } from '../types.ts';
import {
  storageUsage, findUnrecordedFiles, recordStoredFile, reserveStorage, releaseStorageReservation, deleteExpiredReservations,
} from '../repositories/storage-usage.repository.ts';
import { storedFileSize } from '../storage/storage.ts';

// Each account may keep a limited amount of files in storage (STORAGE_QUOTA_MB,
// or its own users.storage_quota_bytes) - hosting them is what costs money.
// Usage comes from the stored_files ledger (see storage.ts).

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return req.files ? Object.values(req.files).flat() : [];
}

function quotaExceeded(res: Response, usedBytes: number, quotaBytes: number): void {
  res.status(413).json({
    error: `You've used ${formatMb(usedBytes)} of your ${formatMb(quotaBytes)} storage - this upload doesn't fit. Delete some work to make room.`,
    storageQuotaExceeded: true,
    usedBytes,
    quotaBytes,
  });
}

// Before the upload is received (place after authenticateToken, before
// multer): an account that's already full is turned away without its file
// being transferred.
export async function requireStorageRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { usedBytes, quotaBytes } = await storageUsage((req as AuthRequest).user!.id);
  if (usedBytes >= quotaBytes) {
    quotaExceeded(res, usedBytes, quotaBytes);
    return;
  }
  next();
}

// Reservations held by requests in flight. Released when the response ends,
// unless the handler takes one over (a model upload hands it to its
// processing job).
const reservations = new WeakMap<Request, string>();

// After multer: the received files must fit in what's left, and that space
// is reserved until they're stored (see reserveStorage). `replaces` names
// files this upload will replace (the current avatar, the model being
// re-uploaded...); they're freed afterwards, so their size is credited.
// For a model, the raw upload stands in for the GLB it becomes.
export function enforceStorageQuota(replaces?: (req: Request) => Promise<(string | null | undefined)[]>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const files = uploadedFiles(req);
    const incoming = files.reduce((sum, file) => sum + file.size, 0);
    if (incoming === 0) {
      next();
      return;
    }

    const userId = (req as AuthRequest).user!.id;
    const replaced = replaces ? (await replaces(req)).filter((url): url is string => !!url) : [];
    const result = await reserveStorage(userId, incoming, replaced);

    if (!result.ok) {
      await Promise.all(files.map(file => rm(file.path, { force: true })));
      quotaExceeded(res, result.usedBytes, result.quotaBytes);
      return;
    }

    reservations.set(req, result.reservationId);
    const release = async () => {
      const id = takeStorageReservation(req);
      if (id) await releaseStorageReservation(id).catch(err => console.error('Failed to release storage reservation:', err));
    };
    // Released before the response goes out (every upload handler answers
    // with JSON): by then the files are recorded, and a next upload the
    // client sends right away must not still see this one's reservation.
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      release().finally(() => json(body));
      return res;
    };
    // Anything else (the client disconnecting...) releases it at the end.
    res.on('close', () => void release());
    next();
  };
}

// Takes over the request's reservation: it's no longer released with the
// response, so the caller must release it (releaseStorageReservation).
export function takeStorageReservation(req: Request): string | undefined {
  const id = reservations.get(req);
  reservations.delete(req);
  return id;
}

// Clears reservations left over from a crash, and adds files stored before
// the ledger existed (or that it missed) to their owners' usage. Cheap once
// everything is recorded: one query that finds nothing.
export async function backfillStorageLedger(): Promise<void> {
  await deleteExpiredReservations();
  const unrecorded = await findUnrecordedFiles();
  let recorded = 0;
  for (const { url, userId } of unrecorded) {
    const size = await storedFileSize(url);
    if (size === null) continue;
    await recordStoredFile(url, userId, size);
    recorded++;
  }
  if (recorded > 0) console.log(`Counted ${recorded} existing file(s) towards their owners' storage`);
}
