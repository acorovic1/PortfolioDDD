import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadUploadedModel, ConversionError } from './convert.ts';
import { optimizeDocument, writeGlb } from './optimize.ts';
import {
  markModelReady,
  markModelFailed,
  findInterruptedProcessing,
} from '../repositories/artworks.repository.ts';
import { persistUpload, deleteStoredFile } from '../storage/storage.ts';
import { announceNewlyPublishedInBackground } from '../services/publisher.ts';

export type ModelJob = {
  artworkId: string;
  // On-disk path of the raw upload (removed once processed).
  sourcePath: string;
  // Used to detect the format - uploads are stored under a random name.
  originalName: string;
};

// Conversions are CPU/memory heavy (and may spawn Blender), so jobs run one
// at a time in this process rather than all at once.
const queue: ModelJob[] = [];
let draining: Promise<void> | null = null;

export function enqueueModelJob(job: ModelJob): void {
  queue.push(job);
  if (!draining) {
    draining = drain().finally(() => {
      draining = null;
    });
  }
}

// Resolves once every queued job has finished (used by tests).
export async function waitForModelJobs(): Promise<void> {
  while (draining) await draining;
}

async function drain(): Promise<void> {
  while (queue.length > 0) {
    await processJob(queue.shift()!);
  }
}

// Converter/parser messages can quote raw file bytes (Postgres rejects NUL)
// and get long; keep what's shown to the uploader printable and short.
function cleanErrorMessage(message: string): string {
  // eslint-disable-next-line no-control-regex
  const printable = message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return printable.length > 500 ? `${printable.slice(0, 497)}...` : printable || 'The model could not be processed';
}

async function processJob(job: ModelJob): Promise<void> {
  const workDir = path.join('uploads', 'tmp', crypto.randomUUID());
  let outputPublicPath: string | null = null;

  try {
    await mkdir(workDir, { recursive: true });

    const { document, format } = await loadUploadedModel(job.sourcePath, job.originalName, workDir);
    await optimizeDocument(document);
    const glb = await writeGlb(document);

    const fileName = `${crypto.randomUUID()}.glb`;
    await mkdir(path.join('uploads', 'models'), { recursive: true });
    await writeFile(path.join('uploads', 'models', fileName), glb);
    outputPublicPath = await persistUpload('models', fileName);

    const previousPath = await markModelReady(job.artworkId, outputPublicPath, glb.byteLength, format);
    if (previousPath === null) {
      // The artwork was deleted while it was processing.
      await deleteStoredFile(outputPublicPath);
    } else if (previousPath === '') {
      // A first upload just became viewable - followers may be waiting on it.
      announceNewlyPublishedInBackground();
    } else {
      // The new version is live at this point; a leftover old file is harmless.
      await deleteStoredFile(previousPath).catch(err => console.error('Failed to delete replaced model:', err));
    }
  } catch (error) {
    if (outputPublicPath) await deleteStoredFile(outputPublicPath).catch(() => {});

    const message = error instanceof ConversionError
      ? cleanErrorMessage(error.message)
      : 'The model could not be processed';
    if (!(error instanceof ConversionError)) {
      console.error(`Model processing failed for artwork ${job.artworkId}:`, error);
    }
    await markModelFailed(job.artworkId, message).catch(err => {
      console.error('Failed to record model processing failure:', err);
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(job.sourcePath, { force: true }).catch(() => {});
  }
}

// Re-queues uploads that were mid-processing when the server last stopped
// (their raw upload is still on disk); ones whose upload is gone are failed.
// Also clears out leftovers from jobs that never ran: scratch directories,
// and raw uploads whose artwork was deleted before it was processed.
export async function resumeInterruptedModelJobs(): Promise<void> {
  const interrupted = await findInterruptedProcessing();

  await rm(path.join('uploads', 'tmp'), { recursive: true, force: true });
  const pendingSources = new Set(interrupted.map(row => path.normalize(row.pending_source_path ?? '')));
  const sourcesDir = path.join('uploads', 'sources');
  const sourceFiles = await readdir(sourcesDir).catch(() => [] as string[]);
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourcesDir, file);
    if (!pendingSources.has(path.normalize(sourcePath))) await rm(sourcePath, { force: true });
  }
  for (const row of interrupted) {
    if (row.pending_source_path && existsSync(row.pending_source_path)) {
      enqueueModelJob({
        artworkId: row.id,
        sourcePath: row.pending_source_path,
        originalName: `upload.${row.source_format ?? ''}`,
      });
    } else {
      await markModelFailed(row.id, 'Processing was interrupted - please upload the model again');
    }
  }
  if (interrupted.length > 0) {
    console.log(`Resumed ${interrupted.length} interrupted model processing job(s)`);
  }
}
