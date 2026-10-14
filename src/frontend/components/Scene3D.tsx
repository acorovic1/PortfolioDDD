import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import UploadDialog from '@/frontend/components/UploadDialog';
import InspectorPanel from '@/frontend/components/InspectorPanel';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useTheme } from '@/frontend/hooks/useTheme';
import { LightLinker } from '@/frontend/three/lightLinking';
import { loadModel, createPortfolioItemFromRemote, type PortfolioPiece, type RemoteArtwork } from '@/types/PortfolioPiece';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { uploadModelThumbnail } from '@/frontend/utils/modelThumbnail';
import { createAddButton, disposeObject, pointerToNdc } from '@/frontend/three/sceneUtils';
import { modelPivot, updatePieceBounds } from '@/frontend/three/modelPivot';
import { carouselRadius, frontPieceId, pieceIndexForObject, rotateCarouselTo, snapCarousel, stepCarousel } from '@/frontend/three/carousel';
import { cameraAnimationTo, stepCameraAnimation, type CameraAnimation, type CameraFraming } from '@/frontend/three/cameraAnimation';
import { useThreeViewport } from './scene/useThreeViewport';
import { useCarousel, useFollowRequestedIndex } from './scene/useCarousel';
import { useModelGizmo } from './scene/useModelGizmo';
import { useCarouselReorder } from './scene/useCarouselReorder';
import { useFocusMode } from './scene/useFocusMode';
import { useFullscreen } from './scene/useFullscreen';
import { useModelJobs } from './scene/useModelJobs';
import { useSavedArtworkLoader } from './scene/useSavedArtworkLoader';
import ModelJobOverlay from './scene/ModelJobOverlay';
import ImageFocusViewer from './scene/ImageFocusViewer';
import { useCarouselVideos } from './scene/useCarouselVideos';
import { findEaselCanvas, rebuildEaselCanvas, type CanvasSettings } from '@/frontend/three/easelCanvas';
import CarouselControls from './scene/CarouselControls';
import ModelToolbar from './scene/ModelToolbar';
import PortfolioStatsPanel from './scene/PortfolioStatsPanel';

// Saves a thumbnail of the piece's model, for models that don't have one yet.
// (A 2D artwork's thumbnail is made from its image on upload.)
async function backfillThumbnail(piece: PortfolioPiece, token: string) {
  if (piece.image) return;
  const thumbnailUrl = await uploadModelThumbnail(piece, token);
  if (thumbnailUrl && piece.modelInfo) piece.modelInfo.thumbnailUrl = thumbnailUrl;
}

// Stores the model's rotation with the artwork (null = as uploaded) and
// re-renders its thumbnail to match.
async function saveModelRotation(piece: PortfolioPiece, token: string) {
  const rotation = modelPivot(piece).quaternion.clone().normalize();
  const modelRotation = rotation.equals(new THREE.Quaternion()) ? null : rotation.toArray();
  try {
    await apiFetch(`/api/portfolio/artworks/${piece.id}`, { method: 'PUT', token, body: { modelRotation } });
  } catch (error) {
    console.error('Failed to save the model rotation:', error);
    return;
  }
  await backfillThumbnail(piece, token);
}

function Scene3D({
  artworks,
  containerRef,
  onArtworkIndexChange,
  onArtworkAdd,
  onArtworksReorder,
  editable = false,
  canManage = false,
  initialIndex = 0,
  remoteArtworksToLoad = null
}: {
  artworks: PortfolioPiece[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onArtworkIndexChange?: (index: number) => void;
  onArtworkAdd?: (artwork: PortfolioPiece) => void;
  // The owner dragged the carousel into a new order (ids, front to back).
  onArtworksReorder?: (artworkIds: string[]) => void;
  editable?: boolean;
  // The viewer owns these artworks (their own portfolio, in view or edit
  // mode): enables new model versions and thumbnail generation.
  canManage?: boolean;
  initialIndex?: number;
  remoteArtworksToLoad?: RemoteArtwork[] | null;
}) {
  const { token } = useAuth();
  const viewport = useThreeViewport(containerRef);
  const { sceneRef, cameraRef, rendererRef, controlsRef, statsRef, postRef, stageRef } = viewport;
  const { theme } = useTheme();
  // Keeps lights that come with a model on that model only.
  const [lightLinker] = useState(() => new LightLinker());

  // The backdrop and floor follow the site theme.
  useEffect(() => {
    stageRef.current?.setTheme(theme);
  }, [theme, stageRef]);

  const cameraAnimationRef = useRef<CameraAnimation | null>(null);
  const animateCameraTo = (piece: PortfolioPiece, framing?: CameraFraming) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    cameraAnimationRef.current = cameraAnimationTo(piece, camera.position, controls.target, framing);
  };

  const carousel = useCarousel({ initialIndex, onIndexChange: onArtworkIndexChange, animateCameraTo });
  const { artworksRef, radiusRef, frontIndex, goToIndex } = carousel;
  const [addButton] = useState(createAddButton);
  const focusMode = useFocusMode({ viewport, artworksRef, addButton, animateCameraTo, token });
  const { focus, focusRef, enterFocus, exitFocus } = focusMode;
  // The 2D or video artwork open in the image viewer (their focus mode).
  const [imageFocus, setImageFocus] = useState<PortfolioPiece | null>(null);
  // Bumped when a piece's canvas changes, to re-render the viewer showing it.
  const [, setCanvasRevision] = useState(0);
  // 2D artworks open in the image viewer, models in the inspector.
  const openPiece = (piece: PortfolioPiece) => {
    if (piece.image) setImageFocus(piece);
    else enterFocus(piece);
  };
  const gizmo = useModelGizmo({
    viewport,
    // A canvas on an easel isn't turned around.
    target: () => {
      const piece = carousel.frontPiece();
      return piece?.image ? undefined : piece;
    },
    allowed: editable && canManage,
    hidden: !!focus,
    deps: [frontIndex, artworks],
    // Saved with the artwork, so every visitor sees the model this way.
    onRotationChange: canManage && token ? (piece) => { void saveModelRotation(piece, token); } : undefined,
  });
  const canReorder = editable && canManage && !!onArtworksReorder;
  const reorder = useCarouselReorder({
    viewport,
    carousel,
    enabled: canReorder && !focus,
    isPointerOnGizmo: gizmo.isPointerOnGizmo,
    animateCameraTo,
    onReorder: onArtworksReorder,
  });
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const jobs = useModelJobs(token, canManage);

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

  // Sync the carousel with the artworks prop.
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
    setImageFocus(open => (open && !artworks.some(a => a.id === open.id) ? null : open));

    // Detach and dispose artworks that were removed (e.g. deleted by the user),
    // so they stop rendering and don't leak GPU resources.
    const scene = sceneRef.current;
    const before = artworksRef.current;
    const frontId = frontPieceId(before);
    const remaining = before.filter(piece => {
      if (artworks.some(a => a.id === piece.id)) return true;
      scene?.remove(piece.root);
      disposeObject(piece.root);
      return false;
    });
    artworksRef.current = remaining;

    // Close the gap: the circle shrinks to fit the pieces that are left and
    // they ease into their new slots. The front piece stays in front, or if
    // it was the one removed, the next one takes its place.
    if (remaining.length < before.length) {
      radiusRef.current = carouselRadius(remaining);
      if (remaining.length > 0) {
        const keptFront = remaining.findIndex(p => p.id === frontId);
        const nextFront = keptFront !== -1
          ? keptFront
          : Math.min(Math.max(0, before.findIndex(p => p.id === frontId)), remaining.length - 1);
        rotateCarouselTo(remaining, nextFront, radiusRef.current);
        carousel.setFrontIndex(nextFront);
        if (!focusRef.current) animateCameraTo(remaining[nextFront]);
      }
    }
    // exitFocus only goes through refs/setters, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks]);

  // The front video artwork plays in the carousel (not while one is open).
  // After the sync above, so it sees newly added pieces in the carousel.
  const videos = useCarouselVideos({ artworks, frontPiece: carousel.frontPiece, frontIndex, active: !focus && !imageFocus });

  useFollowRequestedIndex(carousel, artworks, initialIndex);

  useSavedArtworkLoader(remoteArtworksToLoad, {
    isLoaded: id => artworks.some(a => a.id === id),
    jobs,
    load: async (remote, signal) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const piece = await createPortfolioItemFromRemote(scene, remote);
      if (signal.aborted) {
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
      if (canManage && token && !remote.thumbnailUrl) await backfillThumbnail(piece, token);
    },
  });

  // --- Animation loop ---
  useEffect(() => {
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      statsRef.current?.update();
      focusRef.current?.inspector.update(delta);
      stepCarousel(artworksRef.current);
      stageRef.current?.update(artworksRef.current);
      lightLinker.sync(artworksRef.current.map(p => p.root));

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
      const focused = focusRef.current;
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      // Focus shows one model, so a single pass with the right lights does.
      if (focused && camera) lightLinker.focusOn(focused.piece.root, camera);
      if (focused && post?.usesComposer) {
        post.render();
      } else if (scene && camera && renderer) {
        if (focused) renderer.render(scene, camera);
        else {
          lightLinker.render(renderer, scene, camera);
          gizmo.render(renderer, camera);
        }
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
    // The loop only reads refs, so it's started once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspectFrontArtwork = () => {
    const piece = carousel.frontPiece();
    if (piece) openPiece(piece);
  };

  const closeImageFocus = useCallback(() => {
    setImageFocus(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Owner only: puts a 2D artwork on a canvas with other settings (edges)
  // and stores them with the artwork.
  const changeCanvas = async (piece: PortfolioPiece, canvas: CanvasSettings) => {
    const image = piece.image;
    if (!image || !token) return;
    const previous = image.canvas;
    const apply = (settings: CanvasSettings) => {
      const easel = findEaselCanvas(piece.root);
      if (easel) {
        rebuildEaselCanvas(easel, settings);
        disposeObject(easel);
      }
      piece.image = { ...image, canvas: settings };
      setCanvasRevision(n => n + 1);
    };
    apply(canvas);
    try {
      await apiFetch(`/api/portfolio/artworks/${piece.id}`, { method: 'PUT', token, body: { canvas } });
    } catch (error) {
      console.error('Failed to save the canvas settings:', error);
      apply(previous);
    }
  };

  // Uploads a new version of the focused model. The current one stays in the
  // scene until the new one has been processed, then is swapped in place.
  const replaceFocusedModel = async () => {
    const session = focusRef.current;
    if (!session || !token) return;
    const piece = session.piece;
    const title = piece.infoData.title || 'Untitled';

    const processed = await jobs.uploadNewVersion(piece.id, title);
    if (!processed) return;

    let model: Awaited<ReturnType<typeof loadModel>>;
    try {
      model = await loadModel(assetUrl(processed.modelUrl)!);
    } catch (error) {
      jobs.fail(title, (error as Error).message);
      return;
    }

    // The inspector holds references to the old meshes - close it first,
    // and reopen it on the new version afterwards.
    const wasFocused = focusRef.current?.piece === piece;
    if (wasFocused) exitFocus();

    // Swapped inside the pivot, so the new version keeps the model's rotation.
    const pivot = modelPivot(piece);
    pivot.children.slice().forEach((child) => {
      pivot.remove(child);
      disposeObject(child);
    });
    pivot.add(model.scene);
    updatePieceBounds(piece);
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

    jobs.finish();
    if (wasFocused) enterFocus(piece);
    await backfillThumbnail(piece, token);
  };

  // Uploads a new artwork and brings it to the front of the carousel.
  const addArtwork = async () => {
    const processed = await jobs.uploadNewArtwork();
    if (!processed || !token) return;
    const title = processed.title;

    let newPiece: PortfolioPiece;
    try {
      newPiece = await createPortfolioItemFromRemote(sceneRef.current!, processed);
    } catch (error) {
      console.error('Failed to load the processed model:', error);
      jobs.fail(title, 'The processed model could not be loaded');
      return;
    }
    jobs.finish();
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

    backfillThumbnail(newPiece, token);

    carousel.setFrontIndex(pieces.length - 1);
    animateCameraTo(newPiece);
  };

  // Double-clicking the front model opens it in the inspector; double-clicking
  // any other model rotates the carousel to it first.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    // Models with their own lights live on private layers (lightLinking.ts).
    raycaster.layers.enableAll();
    const pointer = new THREE.Vector2();

    const onDoubleClick = (event: MouseEvent) => {
      const camera = cameraRef.current;
      if (focusRef.current || !camera || gizmo.isPointerOnGizmo() || reorder.isClickFromDrag()) return;
      raycaster.setFromCamera(pointerToNdc(event, canvas, pointer), camera);

      const pieces = artworksRef.current;
      const [hit] = raycaster.intersectObjects(pieces.map(p => p.root), true);
      if (!hit) return;

      const index = pieceIndexForObject(pieces, hit.object);
      if (index === -1) return;

      if (pieces[index].id === frontPieceId(pieces)) {
        openPiece(pieces[index]);
      } else {
        goToIndex(index);
      }
    };

    canvas.addEventListener('dblclick', onDoubleClick);
    return () => canvas.removeEventListener('dblclick', onDoubleClick);
    // Handlers only go through refs/setters, so binding once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In edit mode, clicking the center button adds a new artwork.
  useEffect(() => {
    if (!editable) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (focusRef.current || !renderer || !camera || gizmo.isPointerOnGizmo() || reorder.isClickFromDrag()) return;
      // Only clicks on the scene itself, not on panels over it (e.g. the
      // image viewer, which covers the button).
      if (event.target !== renderer.domElement) return;

      raycaster.setFromCamera(pointerToNdc(event, renderer.domElement, pointer), camera);
      const buttonBounds = addButton.bounds.clone().applyMatrix4(addButton.root.matrixWorld);
      if (raycaster.ray.intersectsBox(buttonBounds)) addArtwork();
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
          replaceBusy={jobs.busy}
        />
      ) : imageFocus?.image ? (
        <ImageFocusViewer
          key={imageFocus.id}
          title={artworks.find(a => a.id === imageFocus.id)?.infoData.title ?? imageFocus.infoData.title}
          image={imageFocus.image}
          renders={artworks.find(a => a.id === imageFocus.id)?.renders ?? imageFocus.renders}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onClose={closeImageFocus}
          onCanvasChange={canManage && token ? (canvas) => { void changeCanvas(imageFocus, canvas); } : undefined}
          onVideoLeave={(time) => {
            const element = imageFocus.image?.video?.element;
            if (element) element.currentTime = time;
          }}
        />
      ) : (
        <CarouselControls
          onRotateCounterClockwise={() => carousel.rotate(-1)}
          onRotateClockwise={() => carousel.rotate(1)}
          onCenter={carousel.centerOnFront}
          onInspect={inspectFrontArtwork}
          canInspect={artworks.length > 0}
          canReorder={canReorder && artworks.length > 1}
          video={videos.frontVideo ?? undefined}
        />
      )}

      {jobs.uploadRequest && (
        <UploadDialog
          fileName={jobs.uploadRequest.fileName}
          kind={jobs.uploadRequest.kind}
          previewUrl={jobs.uploadRequest.previewUrl}
          onSubmit={jobs.answerUploadDialog}
          onCancel={() => jobs.answerUploadDialog(null)}
        />
      )}

      <ModelJobOverlay
        notice={jobs.notice}
        failedUploads={jobs.failedUploads}
        onDismiss={jobs.finish}
        onRemoveFailed={jobs.removeFailed}
      />

      {editable && canManage && !focus && !imageFocus && (
        <ModelToolbar
          rotating={gizmo.enabled}
          onToggleRotate={gizmo.toggle}
          onResetRotation={gizmo.resetRotation}
          disabled={artworks.length === 0 || !!carousel.frontPiece()?.image}
        />
      )}

      {editable && !focus && !imageFocus && <PortfolioStatsPanel artworks={artworks} frontIndex={frontIndex} />}
    </>
  );
}

export default Scene3D;
