import { useEffect, useRef, useState } from 'react';
import type { UploadOptions } from '@/frontend/components/UploadDialog';
import { pickModelFile, type RemoteArtwork } from '@/types/PortfolioPiece';
import { uploadModel, deleteArtwork } from '@/frontend/utils/modelUpload';
import { waitForModelProcessing } from '@/frontend/utils/modelProcessing';
import type { FailedUpload, ModelJobNotice } from './ModelJobOverlay';

const isAbort = (error: unknown) => (error as Error).name === 'AbortError';

// Model uploads and server-side processing, with the notice shown over the
// scene while they run. One job runs at a time. The upload functions resolve
// with the processed artwork once it's ready to load, leaving the notice up
// until the caller has loaded it (finish/fail); they resolve null when the
// user cancels or the job failed (the failure is already shown).
export function useModelJobs(token: string | null, canManage: boolean) {
  const [notice, setNotice] = useState<ModelJobNotice | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  // The upload dialog, open while waiting for the title/publishing choice.
  const [uploadRequest, setUploadRequest] = useState<{
    fileName: string;
    resolve: (options: UploadOptions | null) => void;
  } | null>(null);

  // A job in flight (errors don't count), for long-lived listeners.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = notice !== null && notice.kind !== 'error';
  }, [notice]);

  // Aborts processing polls when the scene unmounts (the server keeps
  // processing; the next load picks the result up).
  const lifetimeRef = useRef<AbortController>(new AbortController());
  useEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    return () => lifetime.abort();
  }, []);

  const fail = (title: string, message: string) => setNotice({ kind: 'error', title, message });
  const finish = () => setNotice(null);

  const upload = (title: string, options: Omit<Parameters<typeof uploadModel>[0], 'token' | 'signal'>) => {
    setNotice({ kind: 'uploading', title, progress: 0 });
    return uploadModel({
      ...options,
      token: token!,
      signal: lifetimeRef.current.signal,
      onProgress: (progress) => setNotice({ kind: 'uploading', title, progress }),
      onProcessing: () => setNotice({ kind: 'processing', title }),
    });
  };

  // Picks a file, asks for its title and publishing choice, and creates a
  // new artwork from it.
  const uploadNewArtwork = async (): Promise<RemoteArtwork | null> => {
    if (!token || busyRef.current) return null;

    const file = await pickModelFile();
    if (!file) return null;
    const options = await new Promise<UploadOptions | null>(resolve =>
      setUploadRequest({ fileName: file.name, resolve })
    );
    if (!options) return null;
    const { title } = options;

    const formData = new FormData();
    formData.append('model', file);
    formData.append('title', title);
    formData.append('draft', options.when === 'draft' ? 'true' : 'false');
    if (options.when === 'schedule' && options.publishAt) formData.append('publishAt', options.publishAt);

    let processed: RemoteArtwork;
    try {
      processed = await upload(title, { path: '/api/portfolio/artworks', formData });
    } catch (error) {
      if (!isAbort(error)) fail(title, (error as Error).message);
      return null;
    }

    if (processed.processingStatus !== 'ready') {
      fail(title, processed.processingError ?? 'Processing failed');
      // A first upload that failed leaves an empty artwork behind - drop it.
      deleteArtwork(processed.id, token);
      return null;
    }
    return processed;
  };

  // Picks a file and uploads it as a new version of an existing artwork's
  // model. The artwork keeps its id, so likes/comments/renders are untouched.
  const uploadNewVersion = async (artworkId: string, title: string): Promise<RemoteArtwork | null> => {
    if (!token || busyRef.current) return null;

    const file = await pickModelFile();
    if (!file) return null;

    const formData = new FormData();
    formData.append('model', file);

    try {
      const processed = await upload(title, {
        path: `/api/portfolio/artworks/${artworkId}/model`,
        method: 'PUT',
        artworkId,
        formData,
      });
      if (processed.processingStatus !== 'ready') {
        fail(title, `${processed.processingError ?? 'Processing failed'} - the previous version is still live`);
        return null;
      }
      return processed;
    } catch (error) {
      if (!isAbort(error)) fail(title, (error as Error).message);
      return null;
    }
  };

  // Waits for an artwork that was still processing when the page loaded.
  const waitUntilProcessed = async (remote: RemoteArtwork, signal: AbortSignal): Promise<RemoteArtwork | null> => {
    if (!token) return null;
    try {
      setNotice({ kind: 'processing', title: remote.title });
      const processed = await waitForModelProcessing(remote.id, token, signal);
      if (processed.processingStatus === 'ready') return processed;
      reportFailed([processed]);
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to wait for model processing:', error);
    } finally {
      setNotice(null);
    }
    return null;
  };

  // Artworks whose processing failed have no model to show; their owner
  // sees them listed in the overlay instead.
  const reportFailed = (artworks: RemoteArtwork[]) => {
    if (!canManage || artworks.length === 0) return;
    setFailedUploads(prev => [...prev, ...artworks.map(a => ({
      id: a.id,
      title: a.title,
      error: a.processingError ?? 'Processing failed',
    }))]);
  };

  const removeFailed = (id: string) => {
    setFailedUploads(prev => prev.filter(f => f.id !== id));
    if (token) deleteArtwork(id, token);
  };

  const answerUploadDialog = (options: UploadOptions | null) => {
    uploadRequest?.resolve(options);
    setUploadRequest(null);
  };

  return {
    notice,
    failedUploads,
    uploadRequest,
    busy: notice !== null && notice.kind !== 'error',
    uploadNewArtwork,
    uploadNewVersion,
    waitUntilProcessed,
    reportFailed,
    removeFailed,
    answerUploadDialog,
    finish,
    fail,
  };
}

export type ModelJobs = ReturnType<typeof useModelJobs>;
