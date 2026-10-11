import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { ModelInspector } from '@/frontend/inspector/ModelInspector';
import { PostProcessing, DEFAULT_POST_SETTINGS, type PostSettings, type ViewerSettings } from '@/frontend/inspector/PostProcessing';
import { apiFetch } from '@/frontend/utils/api';
import { fitCameraClipping, inspectionDistance, modelSize, resetCameraClipping } from '@/frontend/three/sceneUtils';
import { fromSavedCamera, toSavedCamera } from '@/frontend/three/savedView';
import type { CameraFraming } from '@/frontend/three/cameraAnimation';
import type { ThreeViewport } from './useThreeViewport';

// The model currently opened in the inspector (focus mode).
export type FocusSession = {
  piece: PortfolioPiece;
  inspector: ModelInspector;
  // Camera view when focus began (or the saved view) - "reset camera"
  // returns to it.
  entryDirection: THREE.Vector3;
  entryDistance: number;
};

type FocusModeOptions = {
  viewport: ThreeViewport;
  artworksRef: RefObject<PortfolioPiece[]>;
  addButton: PortfolioPiece;
  animateCameraTo: (piece: PortfolioPiece, framing?: CameraFraming) => void;
  token: string | null;
};

// Focus/inspector mode: the selected model is isolated, framed by the camera
// and opened in the inspector panel; the carousel stays intact behind it.
// Every action only goes through refs and state setters, so they're safe to
// call from long-lived event listeners.
export function useFocusMode({ viewport, artworksRef, addButton, animateCameraTo, token }: FocusModeOptions) {
  const { sceneRef, cameraRef, rendererRef, controlsRef, postRef } = viewport;
  const focusRef = useRef<FocusSession | null>(null);
  const postSettingsRef = useRef<PostSettings>(DEFAULT_POST_SETTINGS);
  const [focus, setFocus] = useState<FocusSession | null>(null);
  const [postSettings, setPostSettings] = useState<PostSettings>(DEFAULT_POST_SETTINGS);
  const [autoRotate, setAutoRotate] = useState(false);

  const enterFocus = (piece: PortfolioPiece) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (focusRef.current || !renderer || !scene || !camera || !controls) return;

    artworksRef.current.forEach(p => {
      p.root.visible = p === piece;
    });
    addButton.root.visible = false;

    // Start from the artist's saved view, if there is one.
    const saved = piece.viewerSettings ?? null;
    const post = { ...DEFAULT_POST_SETTINGS, ...saved?.post };
    postSettingsRef.current = post;
    setPostSettings(post);
    if (!postRef.current) postRef.current = new PostProcessing(renderer, scene, camera);
    postRef.current.apply(post, modelSize(piece));

    const fitDistance = inspectionDistance(piece, camera);
    let direction: THREE.Vector3;
    let distance = fitDistance;
    if (saved?.camera) {
      ({ direction, distance } = fromSavedCamera(saved.camera, piece.root.getWorldQuaternion(new THREE.Quaternion()), fitDistance));
    } else {
      direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);
      direction.normalize();
    }

    controls.autoRotate = saved?.autoRotate ?? false;
    controls.autoRotateSpeed = 1.5;
    setAutoRotate(controls.autoRotate);

    fitCameraClipping(camera, distance);

    const session: FocusSession = {
      piece,
      inspector: new ModelInspector(piece.root, piece.animations, piece.bounds),
      entryDirection: direction,
      entryDistance: distance,
    };
    focusRef.current = session;
    setFocus(session);

    animateCameraTo(piece, { distance, direction });
  };

  const exitFocus = () => {
    const session = focusRef.current;
    if (!session) return;

    session.inspector.dispose();
    focusRef.current = null;
    setFocus(null);

    artworksRef.current.forEach(p => {
      p.root.visible = true;
    });
    addButton.root.visible = true;
    postRef.current?.reset();

    if (controlsRef.current) controlsRef.current.autoRotate = false;
    setAutoRotate(false);

    if (cameraRef.current) resetCameraClipping(cameraRef.current);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    // Back out to the regular carousel framing (if the piece still exists).
    if (artworksRef.current.includes(session.piece)) {
      animateCameraTo(session.piece);
    }
  };

  // Owner only: stores the current look + camera as this artwork's default
  // inspector view (or clears it).
  const saveView = async (clear: boolean): Promise<void> => {
    const session = focusRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!session || !camera || !controls || !token) return;

    const offset = camera.position.clone().sub(controls.target);
    const settings: ViewerSettings | null = clear ? null : {
      post: postSettingsRef.current,
      camera: toSavedCamera(
        offset,
        session.piece.root.getWorldQuaternion(new THREE.Quaternion()),
        inspectionDistance(session.piece, camera)
      ),
      autoRotate: controls.autoRotate,
    };

    await apiFetch(`/api/portfolio/artworks/${session.piece.id}`, {
      method: 'PUT',
      token,
      body: { viewerSettings: settings },
    });
    session.piece.viewerSettings = settings;
    if (settings) {
      session.entryDirection = offset.clone().normalize();
      session.entryDistance = offset.length();
    }
  };

  const changePostSettings = (settings: PostSettings) => {
    postSettingsRef.current = settings;
    setPostSettings(settings);
    const session = focusRef.current;
    if (session) postRef.current?.apply(settings, modelSize(session.piece));
  };

  const toggleAutoRotate = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 1.5;
    setAutoRotate(controls.autoRotate);
  };

  const resetCamera = () => {
    const session = focusRef.current;
    if (!session || !cameraRef.current) return;
    animateCameraTo(session.piece, {
      distance: session.entryDistance,
      direction: session.entryDirection,
    });
  };

  // Esc leaves the inspector (the browser handles Esc for fullscreen itself).
  useEffect(() => {
    if (!focus) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) exitFocus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Pieces outlive the scene (they're kept in React state), so a focused one
  // must get its materials/visibility restored when the scene unmounts.
  useEffect(() => () => {
    focusRef.current?.inspector.dispose();
    focusRef.current = null;
    artworksRef.current.forEach(piece => {
      piece.root.visible = true;
    });
  }, [artworksRef]);

  return {
    focus,
    focusRef,
    postSettings,
    autoRotate,
    enterFocus,
    exitFocus,
    saveView,
    changePostSettings,
    toggleAutoRotate,
    resetCamera,
  };
}
