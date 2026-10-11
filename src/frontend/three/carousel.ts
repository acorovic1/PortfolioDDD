import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';
import { modelSize } from './sceneUtils';

// The carousel puts pieces on a circle around the origin, each facing the
// center. Slot 0 is front-center (on +z, nearest the default camera) and the
// slots run around the circle from there. Moves are animated by setting
// `root.userData.targetPosition`, which stepCarousel() eases toward.

// Big enough that neighbouring models don't overlap.
export function carouselRadius(pieces: PortfolioPiece[]): number {
  const largest = pieces.reduce((max, p) => Math.max(max, modelSize(p)), 0);
  return pieces.length === 1
    ? largest
    : Math.max(3, largest * (pieces.length + 1) / (2 * Math.PI));
}

export function slotPosition(slot: number, count: number, radius: number, y = 0): THREE.Vector3 {
  const angle = (slot / count) * Math.PI * 2;
  return new THREE.Vector3(-radius * Math.sin(angle), y, radius * Math.cos(angle));
}

// Slot of the piece at `index` when the piece at `frontIndex` is in front.
function slotFor(index: number, frontIndex: number, count: number): number {
  return (index - frontIndex + count) % count;
}

// Places every piece in its slot immediately, with `frontIndex` in front.
export function snapCarousel(pieces: PortfolioPiece[], frontIndex: number, radius: number): void {
  pieces.forEach((piece, i) => {
    const position = slotPosition(slotFor(i, frontIndex, pieces.length), pieces.length, radius);
    piece.root.position.x = position.x;
    piece.root.position.z = position.z;
    piece.root.lookAt(0, 0, 0);
  });
}

// Sends every piece easing toward its slot, with `frontIndex` in front.
export function rotateCarouselTo(pieces: PortfolioPiece[], frontIndex: number, radius: number): void {
  pieces.forEach((piece, i) => {
    piece.root.userData.targetPosition =
      slotPosition(slotFor(i, frontIndex, pieces.length), pieces.length, radius, piece.root.position.y);
  });
}

// Moves every piece to its neighbour's spot: step 1 takes the next piece's,
// -1 the previous one's. Shifts from where pieces are heading, so steps
// taken mid-animation add up instead of starting from half-way positions.
export function shiftCarousel(pieces: PortfolioPiece[], step: 1 | -1): void {
  const positions = pieces.map(p =>
    ((p.root.userData.targetPosition as THREE.Vector3 | undefined) ?? p.root.position).clone()
  );
  pieces.forEach((piece, i) => {
    piece.root.userData.targetPosition = positions[(i + step + pieces.length) % pieces.length].clone();
  });
}

// Eases pieces toward their pending target positions; call once per frame.
export function stepCarousel(pieces: PortfolioPiece[]): void {
  pieces.forEach(piece => {
    const target: THREE.Vector3 | undefined = piece.root.userData.targetPosition;
    if (!target) return;

    const position = piece.root.position;
    position.lerp(target, 0.1);
    if (position.distanceTo(target) < 0.01) {
      position.copy(target);
      delete piece.root.userData.targetPosition;
    }
    piece.root.lookAt(0, 0, 0);
  });
}

// Which piece is actually front-and-center, read from the scene itself
// (where each piece is, or is heading) rather than from index bookkeeping:
// position is the one thing that's always accurate, mid-animation or not.
export function frontPieceId(pieces: PortfolioPiece[]): string | null {
  if (pieces.length === 0) return null;
  let best = pieces[0];
  let bestZ = -Infinity;
  for (const piece of pieces) {
    const z = (piece.root.userData.targetPosition as THREE.Vector3 | undefined)?.z ?? piece.root.position.z;
    if (z > bestZ) {
      bestZ = z;
      best = piece;
    }
  }
  return best.id;
}

// Index of the piece that `object` (e.g. a raycast hit) belongs to, or -1.
export function pieceIndexForObject(pieces: PortfolioPiece[], object: THREE.Object3D): number {
  return pieces.findIndex(piece => {
    let node: THREE.Object3D | null = object;
    while (node && node !== piece.root) node = node.parent;
    return node === piece.root;
  });
}
