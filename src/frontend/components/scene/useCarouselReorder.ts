import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { frontPieceId, moveItem, positionAtAngle, slotAngle, slotAtAngle, slotFor, slotPosition } from '@/frontend/three/carousel';
import { modelSize, pointerToNdc } from '@/frontend/three/sceneUtils';
import type { ThreeViewport } from './useThreeViewport';
import type { Carousel } from './useCarousel';

// Pixels the pointer must move before a press on a model becomes a drag, so
// clicks and double-clicks keep working.
const DRAG_THRESHOLD = 5;

type Drag = {
  piece: PortfolioPiece;
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
  // The order when the drag began, and the one it would give if dropped now.
  original: PortfolioPiece[];
  order: PortfolioPiece[];
  from: number;
  // Index that holds the front slot; stays in front through the drag.
  frontIndex: number;
  radius: number;
  startAngle: number;
  // Radians of travel around the circle per pixel of pointer movement.
  anglePerPixel: number;
  baseY: number;
  lift: number;
};

type CarouselReorderOptions = {
  viewport: ThreeViewport;
  carousel: Carousel;
  enabled: boolean;
  // Presses on the rotate gizmo are the gizmo's.
  isPointerOnGizmo: () => boolean;
  animateCameraTo: (piece: PortfolioPiece) => void;
  onReorder?: (artworkIds: string[]) => void;
};

// In edit mode, a model can be picked up and dragged sideways around the
// carousel: the others make room as it passes, and dropping it saves the new
// order. Dragging empty space still orbits the camera.
export function useCarouselReorder({ viewport, carousel, enabled, isPointerOnGizmo, animateCameraTo, onReorder }: CarouselReorderOptions) {
  const { rendererRef, cameraRef, controlsRef } = viewport;
  const { artworksRef, radiusRef, setFrontIndex } = carousel;
  const dragRef = useRef<Drag | null>(null);
  // A drag ends in a click event, which must not reach the scene's click handlers.
  const suppressClickRef = useRef(false);

  // The listeners are bound once, so they read the latest values here.
  const latest = useRef({ enabled, isPointerOnGizmo, animateCameraTo, onReorder });
  useEffect(() => {
    latest.current = { enabled, isPointerOnGizmo, animateCameraTo, onReorder };
  });

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!renderer || !camera || !controls) return;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();

    // The nearest model under the pointer, by bounding box (cheap even for
    // heavy meshes, and easy to grab).
    const pieceAt = (event: PointerEvent): PortfolioPiece | null => {
      raycaster.setFromCamera(pointerToNdc(event, canvas, pointer), camera);
      let nearest: PortfolioPiece | null = null;
      let nearestDistance = Infinity;
      for (const piece of artworksRef.current) {
        if (!piece.root.visible || piece.bounds.isEmpty()) continue;
        piece.root.updateWorldMatrix(true, false);
        box.copy(piece.bounds).applyMatrix4(piece.root.matrixWorld);
        if (!raycaster.ray.intersectBox(box, hit)) continue;
        const distance = hit.distanceTo(raycaster.ray.origin);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = piece;
        }
      }
      return nearest;
    };

    // Sends every piece but the dragged one to its slot in `order`.
    const arrange = (drag: Drag) => {
      const count = drag.order.length;
      drag.order.forEach((piece, i) => {
        if (piece === drag.piece) return;
        piece.root.userData.targetPosition =
          slotPosition(slotFor(i, drag.frontIndex, count), count, drag.radius, piece.root.position.y);
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!latest.current.enabled || event.button !== 0 || latest.current.isPointerOnGizmo()) return;
      const pieces = artworksRef.current;
      if (pieces.length < 2) return;
      const piece = pieceAt(event);
      if (!piece) return;

      const frontIndex = pieces.findIndex(p => p.id === frontPieceId(pieces));
      const from = pieces.indexOf(piece);
      const radius = radiusRef.current;
      const distance = camera.position.distanceTo(piece.root.getWorldPosition(new THREE.Vector3()));
      const worldPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / canvas.clientHeight;

      dragRef.current = {
        piece,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        original: [...pieces],
        order: [...pieces],
        from,
        frontIndex,
        radius,
        startAngle: slotAngle(slotFor(from, frontIndex, pieces.length), pieces.length),
        // Follows the pointer near the front, but never needs more than
        // half the viewport's width to reach the next slot.
        anglePerPixel: Math.max(
          worldPerPixel / Math.max(radius, 1e-3),
          slotAngle(1, pieces.length) / (canvas.clientWidth * 0.5)
        ),
        baseY: piece.root.position.y,
        lift: modelSize(piece) * 0.08,
      };
      // Pressing a model grabs it instead of orbiting the camera.
      controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        // Show that models can be grabbed.
        if (latest.current.enabled && artworksRef.current.length > 1 && !latest.current.isPointerOnGizmo()) {
          canvas.style.cursor = pieceAt(event) ? 'grab' : '';
        } else if (canvas.style.cursor === 'grab') {
          canvas.style.cursor = '';
        }
        return;
      }
      if (event.pointerId !== drag.pointerId) return;

      const dx = event.clientX - drag.startX;
      if (!drag.started) {
        if (Math.hypot(dx, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.started = true;
        delete drag.piece.root.userData.targetPosition;
        canvas.style.cursor = 'grabbing';
      }

      // Moving the pointer right moves the model right, around the circle.
      const angle = drag.startAngle - dx * drag.anglePerPixel;
      const y = drag.baseY + drag.lift;
      drag.piece.root.position.copy(positionAtAngle(angle, drag.radius, y));
      drag.piece.root.lookAt(0, y, 0);

      const count = drag.original.length;
      const to = (slotAtAngle(angle, count) + drag.frontIndex) % count;
      const order = moveItem(drag.original, drag.from, to);
      if (order.some((piece, i) => piece !== drag.order[i])) {
        drag.order = order;
        arrange(drag);
      }
    };

    const endDrag = (event: PointerEvent, cancelled: boolean) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      controls.enabled = true;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = '';
      if (!drag.started) return;

      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);

      // A model that loaded or was removed mid-drag: put everything back.
      const pieces = artworksRef.current;
      const unchangedSet = pieces.length === drag.original.length && drag.original.every(p => pieces.includes(p));
      if (cancelled || !unchangedSet) drag.order = unchangedSet ? drag.original : pieces;

      const count = drag.order.length;
      const to = drag.order.indexOf(drag.piece);
      if (to !== -1) {
        drag.piece.root.userData.targetPosition =
          slotPosition(slotFor(to, drag.frontIndex, count), count, drag.radius, drag.baseY);
      }
      arrange(drag);

      const changed = drag.order.some((piece, i) => piece !== drag.original[i]);
      if (!changed) return;
      artworksRef.current = drag.order;
      setFrontIndex(drag.frontIndex);
      latest.current.animateCameraTo(drag.order[drag.frontIndex]);
      latest.current.onReorder?.(drag.order.map(p => p.id));
    };

    const onPointerUp = (event: PointerEvent) => endDrag(event, false);
    const onPointerCancel = (event: PointerEvent) => endDrag(event, true);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      controls.enabled = true;
    };
    // Bound once, after the viewport; handlers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // True right after a drag, when its click should be ignored.
    isClickFromDrag: () => suppressClickRef.current,
  };
}
