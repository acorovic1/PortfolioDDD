import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import UploadDialog, { type UploadOptions } from '@/frontend/components/UploadDialog';
import { useAuth } from '@/frontend/hooks/useAuth';
import {
  pickModelFile,
  loadModel,
  createPortfolioItemFromRemote,
  type PortfolioPiece,
  type RemoteArtwork,
} from '@/types/PortfolioPiece';
import InspectorPanel from '@/frontend/components/InspectorPanel';
import { assetUrl } from '@/frontend/utils/api';
import { uploadModel, deleteArtwork } from '@/frontend/utils/modelUpload';
import { waitForModelProcessing } from '@/frontend/utils/modelProcessing';
import { uploadModelThumbnail } from '@/frontend/utils/modelThumbnail';
import { createAddButton, disposeObject } from '@/frontend/three/sceneUtils';
import {
  carouselRadius,
  frontPieceId,
  pieceIndexForObject,
  rotateCarouselTo,
  shiftCarousel,
  snapCarousel,
  stepCarousel,
} from '@/frontend/three/carousel';
import { cameraAnimationTo, stepCameraAnimation, type CameraAnimation, type CameraFraming } from '@/frontend/three/cameraAnimation';
import { useThreeViewport } from './scene/useThreeViewport';
import { useFocusMode } from './scene/useFocusMode';
import { useFullscreen } from './scene/useFullscreen';
import ModelJobOverlay, { type FailedUpload, type ModelJobNotice } from './scene/ModelJobOverlay';
import CarouselControls from './scene/CarouselControls';
import PortfolioStatsPanel from './scene/PortfolioStatsPanel';

function Scene3D({
  artworks,
  containerRef,
  onArtworkIndexChange,
  onArtworkAdd,
  editable = false,
  canManage = false,
  initialIndex = 0,
  remoteArtworksToLoad = null
}: {
  artworks: PortfolioPiece[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onArtworkIndexChange?: (index: number) => void;
  onArtworkAdd?: (artwork: PortfolioPiece) => void;
  editable?: boolean;
  // The viewer owns these artworks (their own portfolio, in view or edit
  // mode): enables new model versions and thumbnail generation.
  canManage?: boolean;
  initialIndex?: number;
  remoteArtworksToLoad?: RemoteArtwork[] | null;
}) {
  const viewport = useThreeViewport(containerRef);
  const { sceneRef, cameraRef, rendererRef, controlsRef, statsRef, postRef } = viewport;

  // Pieces currently in the scene, in carousel order. Kept apart from the
  // `artworks` prop because loads land here before the parent re-renders.
  const artworksRef = useRef<PortfolioPiece[]>([]);
  const [addButton] = useState(createAddButton);
  const radiusRef = useRef(3);
  const cameraAnimationRef = useRef<CameraAnimation | null>(null);

  const animateCameraTo = (piece: PortfolioPiece, framing?: CameraFraming) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    cameraAnimationRef.current = cameraAnimationTo(piece, camera.position, controls.target, framing);
  };

  const { token } = useAuth();
  const focusMode = useFocusMode({ viewport, artworksRef, addButton, animateCameraTo, token });
  const { focus, focusRef, enterFocus, exitFocus } = focusMode;
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  const [frontIndex, setFrontIndex] = useState(initialIndex);
  const [jobNotice, setJobNotice] = useState<ModelJobNotice | null>(null);
  // The upload dialog, open while waiting for the title/publishing choice.
  const [uploadRequest, setUploadRequest] = useState<{
    fileName: string;
    resolve: (options: UploadOptions | null) => void;
  } | null>(null);
  // A job in flight (errors don't count), for long-lived listeners.
  const jobNoticeRef = useRef<ModelJobNotice | null>(null);
  useEffect(() => {
    jobNoticeRef.current = jobNotice?.kind === 'error' ? null : jobNotice;
  }, [jobNotice]);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);

  // Aborts processing polls when the scene unmounts (the server keeps
  // processing; the next load picks the result up).
  const lifetimeRef = useRef<AbortController>(new AbortController());
  useEffect(() => {
    const lifetime = new AbortController();
    lifetimeRef.current = lifetime;
    return () => lifetime.abort();
  }, []);

  useEffect(() => {
    onArtworkIndexChange?.(frontIndex);
  }, [frontIndex, onArtworkIndexChange]);

  // Re-attach artworks that already existed before this mount: the component
  // remounts whenever the user navigates away and back, and the fresh Scene
  // starts out empty while the pieces themselves survive in React state.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || artworks.length === 0) return;
    artworks.forEach(piece => {
      if (!scene.children.includes(piece.root)) scene.add(piece.root);
    });
    radiusRef.current = carouselRadius(artworks);
    // Mount only, right after the viewport has created the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync artworksRef with the artworks prop.
  useEffect(() => {
    artworks.forEach((artwork) => {
      if (!artworksRef.current.find(a => a.id === artwork.id)) {
        artworksRef.current.push(artwork);
      }
    });

    // Leave the inspector first if its artwork is the one being removed, so
    // its material swaps are undone before the materials get disposed.
    const focused = focusRef.current;
    if (focused && !artworks.some(a => a.id === focused.piece.id)) {
      exitFocus();
    }

    // Detach and dispose artworks that were removed (e.g. deleted by the user),
    // so they stop rendering and don't leak GPU resources.
    const scene = sceneRef.current;
    artworksRef.current = artworksRef.current.filter(piece => {
      if (artworks.some(a => a.id === piece.id)) return true;
      scene?.remove(piece.root);
      disposeObject(piece.root);
      return false;
    });
    // exitFocus only goes through refs/setters, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks]);

  // Load artworks the user already saved previously (e.g. right after login),
  // reconstructing each one's 3D object from its backend model URL. Artworks
  // still being processed server-side are loaded once processing finishes.
  useEffect(() => {
    if (!remoteArtworksToLoad || remoteArtworksToLoad.length === 0) return;
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;
    const signal = lifetimeRef.current.signal;

    const addRemote = async (remote: RemoteArtwork) => {
      const piece = await createPortfolioItemFromRemote(scene, remote);
      if (cancelled) {
        scene.remove(piece.root);
        disposeObject(piece.root);
        return;
      }

      piece.root.visible = !focusRef.current;
      artworksRef.current.push(piece);
      radiusRef.current = carouselRadius(artworksRef.current);
      snapCarousel(artworksRef.current, 0, radiusRef.current);

      onArtworkAdd?.(piece);

      // Backfill thumbnails for models processed before thumbnails existed.
      if (canManage && token && !remote.thumbnailUrl) {
        const thumbnailUrl = await uploadModelThumbnail(piece, token);
        if (thumbnailUrl && piece.modelInfo) piece.modelInfo.thumbnailUrl = thumbnailUrl;
      }
    };

    (async () => {
      const pending: RemoteArtwork[] = [];
      const failed: FailedUpload[] = [];

      for (const remote of remoteArtworksToLoad) {
        if (cancelled) return;
        if (artworks.some(a => a.id === remote.id)) continue; // already loaded

        if (!remote.modelUrl) {
          if (remote.processingStatus === 'processing') pending.push(remote);
          else failed.push({ id: remote.id, title: remote.title, error: remote.processingError ?? 'Processing failed' });
          continue;
        }

        try {
          await addRemote(remote);
        } catch (error) {
          console.error('Failed to load a saved artwork into the scene:', error);
        }
      }

      if (canManage && failed.length > 0) setFailedUploads(prev => [...prev, ...failed]);
      if (!token) return;

      for (const remote of pending) {
        if (cancelled) return;
        try {
          setJobNotice({ kind: 'processing', title: remote.title });
          const processed = await waitForModelProcessing(remote.id, token, signal);
          if (cancelled) return;
          if (processed.processingStatus === 'ready') {
            await addRemote(processed);
          } else if (canManage) {
            setFailedUploads(prev => [...prev, {
              id: processed.id,
              title: processed.title,
              error: processed.processingError ?? 'Processing failed',
            }]);
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') console.error('Failed to wait for model processing:', error);
        } finally {
          if (!cancelled) setJobNotice(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only depends on remoteArtworksToLoad: this should run once
    // as a continuous sequence when the list first arrives, not restart every
    // time onArtworkAdd (below) causes the artworks prop to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteArtworksToLoad]);

  // --- Animation loop ---
  useEffect(() => {
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      statsRef.current?.update();
      focusRef.current?.inspector.update(delta);
      stepCarousel(artworksRef.current);

      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const cameraAnimation = cameraAnimationRef.current;
      if (cameraAnimation && camera && controls) {
        const done = stepCameraAnimation(cameraAnimation, camera.position, controls.target, performance.now());
        controls.update();
        if (done) cameraAnimationRef.current = null;
      } else if (controls?.autoRotate) {
        controls.update(delta);
      }

      const post = postRef.current;
      if (focusRef.current && post?.usesComposer) {
        post.render();
      } else if (sceneRef.current && camera) {
        rendererRef.current?.render(sceneRef.current, camera);
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
    // The loop only reads refs, so it's started once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate the carousel so an arbitrary artwork lands front-center, then
  // focus the camera on it - used to jump straight to a specific artwork
  // (e.g. deep-linking from Liked/Saved) rather than stepping one at a time.
  const goToIndex = (index: number) => {
    const pieces = artworksRef.current;
    if (index < 0 || index >= pieces.length) return;
    rotateCarouselTo(pieces, index, radiusRef.current);
    setFrontIndex(index);
    animateCameraTo(pieces[index]);
  };

  const rotate = (step: 1 | -1) => {
    const pieces = artworksRef.current;
    if (pieces.length === 0) return;
    shiftCarousel(pieces, step);
    const newFrontIndex = (frontIndex - step + pieces.length) % pieces.length;
    setFrontIndex(newFrontIndex);
    animateCameraTo(pieces[newFrontIndex]);
  };

  // Center the camera on the currently active artwork.
  const focusOnActiveArtwork = () => {
    const piece = artworksRef.current[frontIndex];
    if (piece) animateCameraTo(piece);
  };

  const inspectFrontArtwork = () => {
    const frontId = frontPieceId(artworksRef.current);
    const piece = artworksRef.current.find(p => p.id === frontId);
    if (piece) enterFocus(piece);
  };

  // Uploads a new version of the focused model. The current one stays in the
  // scene until the new one has been processed, then is swapped in place -
  // the artwork keeps its id, so likes/comments/renders are untouched.
  const replaceFocusedModel = async () => {
    const session = focusRef.current;
    if (!session || !token || jobNoticeRef.current) return;
    const piece = session.piece;
    const title = piece.infoData.title || 'Untitled';

    const file = await pickModelFile();
    if (!file) return;

    const formData = new FormData();
    formData.append('model', file);

    try {
      setJobNotice({ kind: 'uploading', title, progress: 0 });
      const processed = await uploadModel({
        path: `/api/portfolio/artworks/${piece.id}/model`,
        method: 'PUT',
        artworkId: piece.id,
        formData,
        token,
        signal: lifetimeRef.current.signal,
        onProgress: (progress) => setJobNotice({ kind: 'uploading', title, progress }),
        onProcessing: () => setJobNotice({ kind: 'processing', title }),
      });
      if (processed.processingStatus !== 'ready') {
        setJobNotice({
          kind: 'error',
          title,
          message: `${processed.processingError ?? 'Processing failed'} - the previous version is still live`,
        });
        return;
      }

      const model = await loadModel(assetUrl(processed.modelUrl)!);

      // The inspector holds references to the old meshes - close it first,
      // and reopen it on the new version afterwards.
      const wasFocused = focusRef.current?.piece === piece;
      if (wasFocused) exitFocus();

      piece.root.children.slice().forEach((child) => {
        piece.root.remove(child);
        disposeObject(child);
      });
      piece.root.add(model.scene);
      piece.bounds.copy(model.bounds);
      piece.animations.splice(0, piece.animations.length, ...model.animations);
      piece.modelInfo = {
        sourceFormat: processed.sourceFormat,
        version: processed.modelVersion,
        sizeBytes: processed.modelSizeBytes,
        thumbnailUrl: processed.thumbnailUrl,
      };

      // The new version may be a different size: re-space the carousel.
      radiusRef.current = carouselRadius(artworksRef.current);
      const index = artworksRef.current.indexOf(piece);
      if (index !== -1) goToIndex(index);

      setJobNotice(null);
      if (wasFocused) enterFocus(piece);

      const thumbnailUrl = await uploadModelThumbnail(piece, token);
      if (thumbnailUrl && piece.modelInfo) piece.modelInfo.thumbnailUrl = thumbnailUrl;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setJobNotice({ kind: 'error', title, message: (error as Error).message });
    }
  };

  const removeFailedUpload = (id: string) => {
    setFailedUploads(prev => prev.filter(f => f.id !== id));
    if (token) deleteArtwork(id, token);
  };

  // Double-clicking the front model opens it in the inspector; double-clicking
  // any other model rotates the carousel to it first.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onDoubleClick = (event: MouseEvent) => {
      const camera = cameraRef.current;
      if (focusRef.current || !camera) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const pieces = artworksRef.current;
      const [hit] = raycaster.intersectObjects(pieces.map(p => p.root), true);
      if (!hit) return;

      const index = pieceIndexForObject(pieces, hit.object);
      if (index === -1) return;

      if (pieces[index].id === frontPieceId(pieces)) {
        enterFocus(pieces[index]);
      } else {
        goToIndex(index);
      }
    };

    canvas.addEventListener('dblclick', onDoubleClick);
    return () => canvas.removeEventListener('dblclick', onDoubleClick);
    // Handlers only go through refs/setters, so binding once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the carousel's front-facing artwork in sync with the selected index
  // whenever it points at a different artwork than what's actually front -
  // covers both a deep link resolving once its artwork loads, and jumping
  // straight to an artwork on a remount that already has it loaded.
  //
  // Only an index the parent *asked for* is acted on: after a local change
  // (adding/rotating) the parent briefly still holds the previous index, and
  // obeying that stale value would rotate back, report it, get the new value
  // echoed... ping-ponging forever.
  const handledInitialIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const parentRequested = handledInitialIndexRef.current !== initialIndex;
    if (!parentRequested && initialIndex !== frontIndex) return; // parent hasn't caught up yet

    const targetId = artworks[initialIndex]?.id;
    if (!targetId) return;

    const targetRefIndex = artworksRef.current.findIndex(p => p.id === targetId);
    if (targetRefIndex === -1) return; // not loaded into the scene yet

    handledInitialIndexRef.current = initialIndex;
    if (frontPieceId(artworksRef.current) === targetId) return;
    goToIndex(targetRefIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndex, artworks]);

  // --- Clicking the center button (edit mode) adds a new artwork ---
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = async (event: MouseEvent) => {
      if (!editable || focusRef.current) return;
      if (!rendererRef.current || !cameraRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current);

      const buttonBounds = addButton.bounds.clone().applyMatrix4(addButton.root.matrixWorld);
      if (!raycaster.ray.intersectsBox(buttonBounds)) return;

      if (!token || jobNoticeRef.current) return;

      const file = await pickModelFile();
      if (!file) return;
      const options = await new Promise<UploadOptions | null>(resolve =>
        setUploadRequest({ fileName: file.name, resolve })
      );
      if (!options) return;
      const { title } = options;

      const formData = new FormData();
      formData.append('model', file);
      formData.append('title', title);
      formData.append('draft', options.when === 'draft' ? 'true' : 'false');
      if (options.when === 'schedule' && options.publishAt) formData.append('publishAt', options.publishAt);

      let processed: RemoteArtwork;
      try {
        setJobNotice({ kind: 'uploading', title, progress: 0 });
        processed = await uploadModel({
          path: '/api/portfolio/artworks',
          formData,
          token,
          signal: lifetimeRef.current.signal,
          onProgress: (progress) => setJobNotice({ kind: 'uploading', title, progress }),
          onProcessing: () => setJobNotice({ kind: 'processing', title }),
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setJobNotice({ kind: 'error', title, message: (error as Error).message });
        return;
      }

      if (processed.processingStatus !== 'ready') {
        setJobNotice({ kind: 'error', title, message: processed.processingError ?? 'Processing failed' });
        // A first upload that failed leaves an empty artwork behind - drop it.
        deleteArtwork(processed.id, token);
        return;
      }

      let newPiece: PortfolioPiece;
      try {
        newPiece = await createPortfolioItemFromRemote(sceneRef.current!, processed);
      } catch (error) {
        console.error('Failed to load the processed model:', error);
        setJobNotice({ kind: 'error', title, message: 'The processed model could not be loaded' });
        return;
      }
      setJobNotice(null);
      newPiece.root.visible = !focusRef.current;

      onArtworkAdd?.(newPiece);

      // Rotate everything so the new piece (last in order) lands front-center;
      // existing artworks ease into their shifted slot, the new piece simply
      // appears already in its final spot.
      const pieces = [...artworksRef.current, newPiece];
      radiusRef.current = carouselRadius(pieces);
      newPiece.root.position.set(0, newPiece.root.position.y, radiusRef.current);
      newPiece.root.lookAt(0, 0, 0);
      rotateCarouselTo(pieces, pieces.length - 1, radiusRef.current);

      uploadModelThumbnail(newPiece, token).then((thumbnailUrl) => {
        if (thumbnailUrl && newPiece.modelInfo) newPiece.modelInfo.thumbnailUrl = thumbnailUrl;
      });

      setFrontIndex(pieces.length - 1);
      animateCameraTo(newPiece);
    };

    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onArtworkAdd, token, editable]);

  // Show/hide the add button when edit mode toggles. It's fixed at the
  // center, excluded from the rotating circle.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (editable) {
      if (!scene.children.includes(addButton.root)) scene.add(addButton.root);
      addButton.root.position.set(0, 0, 0);
      addButton.root.visible = !focusRef.current;
    } else {
      scene.remove(addButton.root);
    }

    snapCarousel(artworksRef.current, frontIndex, radiusRef.current);
    // Intentionally only reacts to `editable` toggling - it snaps positions
    // instantly, so also depending on `frontIndex` would fight the smooth
    // animation that rotate/goToIndex already drive on every turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  return (
    <>
      {focus ? (
        <InspectorPanel
          key={focus.piece.id}
          title={artworks.find(a => a.id === focus.piece.id)?.infoData.title ?? focus.piece.infoData.title}
          inspector={focus.inspector}
          postSettings={focusMode.postSettings}
          onPostSettingsChange={focusMode.changePostSettings}
          autoRotate={focusMode.autoRotate}
          onToggleAutoRotate={focusMode.toggleAutoRotate}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onResetCamera={focusMode.resetCamera}
          onExit={exitFocus}
          modelInfo={focus.piece.modelInfo}
          onReplaceModel={canManage && focus.piece.modelInfo ? replaceFocusedModel : undefined}
          onSaveView={canManage ? focusMode.saveView : undefined}
          hasSavedView={!!focus.piece.viewerSettings}
          replaceBusy={jobNotice !== null && jobNotice.kind !== 'error'}
        />
      ) : (
        <CarouselControls
          onRotateCounterClockwise={() => rotate(-1)}
          onRotateClockwise={() => rotate(1)}
          onCenter={focusOnActiveArtwork}
          onInspect={inspectFrontArtwork}
          canInspect={artworks.length > 0}
        />
      )}

      {uploadRequest && (
        <UploadDialog
          fileName={uploadRequest.fileName}
          onSubmit={(options) => { uploadRequest.resolve(options); setUploadRequest(null); }}
          onCancel={() => { uploadRequest.resolve(null); setUploadRequest(null); }}
        />
      )}

      <ModelJobOverlay
        notice={jobNotice}
        failedUploads={failedUploads}
        onDismiss={() => setJobNotice(null)}
        onRemoveFailed={removeFailedUpload}
      />

      {editable && !focus && <PortfolioStatsPanel artworks={artworks} frontIndex={frontIndex} />}
    </>
  );
}

export default Scene3D;
