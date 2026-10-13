import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { modelPivot, resetModelRotation, updatePieceBounds } from '@/frontend/three/modelPivot';
import type { ThreeViewport } from './useThreeViewport';

type Gizmo = {
  controls: TransformControls;
  // The gizmo is drawn on top in its own pass: the carousel renders lit models
  // in later passes (lightLinking.ts) that would otherwise paint over it.
  overlay: THREE.Scene;
  piece: PortfolioPiece | null;
};

type ModelGizmoOptions = {
  viewport: ThreeViewport;
  // The model the gizmo sits on.
  target: () => PortfolioPiece | undefined;
  // Only the owner, in edit mode, can turn it on.
  allowed: boolean;
  // Kept on but out of sight (e.g. while inspecting).
  hidden: boolean;
  // Re-checks the target when any of these change (front artwork, artworks).
  deps: unknown[];
  // Called once a drag (or a reset) has changed the model's rotation.
  onRotationChange?: (piece: PortfolioPiece) => void;
};

// A Blender-style rotate gizmo on the front model of the carousel, for the
// owner in edit mode: its rings turn the model around its own center.
export function useModelGizmo({ viewport, target, allowed, hidden, deps, onRotationChange }: ModelGizmoOptions) {
  const { cameraRef, rendererRef, controlsRef } = viewport;
  const gizmoRef = useRef<Gizmo | null>(null);
  const [enabled, setEnabled] = useState(false);
  // Leaving edit mode switches it off, so it isn't back on next time.
  const [wasAllowed, setWasAllowed] = useState(allowed);
  if (allowed !== wasAllowed) {
    setWasAllowed(allowed);
    if (!allowed) setEnabled(false);
  }
  // The listeners below are bound once, so they read the latest callback here.
  const onRotationChangeRef = useRef(onRotationChange);
  useEffect(() => {
    onRotationChangeRef.current = onRotationChange;
  });

  // --- Setup once, after the viewport ---
  useEffect(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const orbit = controlsRef.current;
    if (!camera || !renderer || !orbit) return;

    const controls = new TransformControls(camera, renderer.domElement);
    controls.setMode('rotate');
    const overlay = new THREE.Scene();
    overlay.add(controls.getHelper());
    const gizmo: Gizmo = { controls, overlay, piece: null };
    gizmoRef.current = gizmo;

    // Dragging a ring turns the model, not the camera.
    const onDraggingChanged = (event: { value: unknown }) => {
      orbit.enabled = !event.value;
      if (!event.value && gizmo.piece) onRotationChangeRef.current?.(gizmo.piece);
    };
    const onObjectChange = () => {
      if (gizmo.piece) updatePieceBounds(gizmo.piece);
    };
    controls.addEventListener('dragging-changed', onDraggingChanged);
    controls.addEventListener('objectChange', onObjectChange);

    return () => {
      controls.removeEventListener('dragging-changed', onDraggingChanged);
      controls.removeEventListener('objectChange', onObjectChange);
      controls.detach();
      controls.dispose();
      orbit.enabled = true;
      gizmoRef.current = null;
    };
    // Intentionally runs once on mount, like the viewport it builds on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Follow the front model ---
  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    const piece = enabled && allowed && !hidden ? target() : undefined;
    if (piece) {
      gizmo.piece = piece;
      gizmo.controls.attach(modelPivot(piece));
    } else {
      gizmo.piece = null;
      gizmo.controls.detach();
    }
    // `target` reads refs; `deps` says when its answer may have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, allowed, hidden, ...deps]);

  // Call after the scene has been rendered for the frame.
  const render = (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
    const gizmo = gizmoRef.current;
    if (!gizmo?.piece) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(gizmo.overlay, camera);
    renderer.autoClear = autoClear;
  };

  // Whether the pointer is on (or dragging) one of the gizmo's rings, so
  // clicks there aren't also taken as clicks on the scene behind it.
  const isPointerOnGizmo = () => {
    const controls = gizmoRef.current?.controls;
    return !!controls?.object && (controls.dragging || controls.axis !== null);
  };

  const resetRotation = () => {
    const piece = gizmoRef.current?.piece;
    if (!piece) return;
    resetModelRotation(piece);
    onRotationChangeRef.current?.(piece);
  };

  return {
    enabled: enabled && allowed,
    toggle: () => setEnabled(value => !value),
    resetRotation,
    render,
    isPointerOnGizmo,
  };
}
