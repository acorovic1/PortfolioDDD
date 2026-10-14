import { useEffect, useRef, useState } from 'react';
import type { UploadOptions } from '@/frontend/components/UploadDialog';
import { pickModelFile, isImageFile, isVideoFile, MODEL_FILE_ACCEPT, IMAGE_FILE_ACCEPT, VIDEO_FILE_ACCEPT, type ArtworkKind, type RemoteArtwork } from '@/types/PortfolioPiece';
import { uploadModel, uploadImageArtwork, deleteArtwork } from '@/frontend/utils/modelUpload';
import { waitForModelProcessing } from '@/frontend/utils/modelProcessing';
import { readVideoFile, type VideoFileInfo } from '@/frontend/utils/videoFile';
import type { FailedUpload, ModelJobNotice } from './ModelJobOverlay';
import { useI18n } from '@/frontend/hooks/useI18n';
import { uploadErrorText } from '@/frontend/utils/storageQuota';

const isAbort = (error: unknown) => (error as Error).name === 'AbortError';

// Model uploads and server-side processing, with the notice shown over the
// scene while they run. One job runs at a time. The upload functions resolve
// with the processed artwork once it's ready to load, leaving the notice up
// until the caller has loaded it (finish/fail); they resolve null when the
// user cancels or the job failed (the failure is already shown).
export function useModelJobs(token: string | null, canManage: boolean) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<ModelJobNotice | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  // The upload dialog, open while waiting for the title/publishing choice
  // (and, for a 2D artwork, its canvas).
  const [uploadRequest, setUploadRequest] = useState<{
    fileName: string;
    kind: ArtworkKind;
    // A local preview of an image or video being uploaded.
    previewUrl?: string;
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
  // new artwork from it: a model, an image (a 2D artwork) or a video.
  const uploadNewArtwork = async (): Promise<RemoteArtwork | null> => {
    if (!token || busyRef.current) return null;

    const file = await pickModelFile(`${MODEL_FILE_ACCEPT},${IMAGE_FILE_ACCEPT},${VIDEO_FILE_ACCEPT}`);
    if (!file) return null;
    const kind: ArtworkKind = isImageFile(file) ? 'image' : isVideoFile(file) ? 'video' : 'model';
    const isFlat = kind !== 'model';

    // The server doesn't decode video: read its size, length and a poster
    // frame here (which also tells whether browsers can play it at all).
    let videoInfo: VideoFileInfo | null = null;
    if (kind === 'video') {
      try {
        videoInfo = await readVideoFile(file);
      } catch (error) {
        fail(file.name, uploadErrorText(error, t));
        return null;
      }
    }

    const previewUrl = isFlat ? URL.createObjectURL(file) : undefined;
    const options = await new Promise<UploadOptions | null>(resolve =>
      setUploadRequest({ fileName: file.name, kind, previewUrl, resolve })
    );
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!options) return null;
    const { title } = options;

    const formData = new FormData();
    formData.append(kind, file);
    formData.append('title', title);
    formData.append('draft', options.when === 'draft' ? 'true' : 'false');
    if (options.when === 'schedule' && options.publishAt) formData.append('publishAt', options.publishAt);

    if (isFlat) {
      const canvas = options.canvas;
      if (canvas) {
        formData.append('edge', canvas.edge);
        if (canvas.medium) formData.append('medium', canvas.medium);
      }
      if (videoInfo) {
        formData.append('width', String(videoInfo.width));
        formData.append('height', String(videoInfo.height));
        formData.append('duration', String(videoInfo.duration));
        formData.append('poster', videoInfo.poster, videoInfo.poster.type === 'image/png' ? 'poster.png' : 'poster.webp');
      }
      setNotice({ kind: 'uploading', title, progress: 0 });
      try {
        return await uploadImageArtwork({
          formData,
          token,
          kind: kind === 'video' ? 'video' : 'image',
          onProgress: (progress) => setNotice({ kind: 'uploading', title, progress }),
        });
      } catch (error) {
        fail(title, uploadErrorText(error, t));
        return null;
      }
    }

    let processed: RemoteArtwork;
    try {
      processed = await upload(title, { path: '/api/portfolio/artworks', formData });
    } catch (error) {
      if (!isAbort(error)) fail(title, uploadErrorText(error, t));
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
      if (!isAbort(error)) fail(title, uploadErrorText(error, t));
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
