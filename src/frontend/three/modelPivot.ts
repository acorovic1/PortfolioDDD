import * as THREE from 'three';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

// The carousel places each piece's root and turns it to face the center every
// frame, so a model can't be rotated through its root. Instead the model sits
// in a pivot group under the root. Models are centered on their root when
// loaded, so the pivot is at the model's center and rotating it turns the
// model around its own center.

const PIVOT_KEY = 'modelPivot';

// The piece's pivot, created on first use by moving the root's children into it.
export function modelPivot(piece: PortfolioPiece): THREE.Group {
  const existing = piece.root.children.find(child => child.userData[PIVOT_KEY]);
  if (existing) return existing as THREE.Group;

  const pivot = new THREE.Group();
  pivot.userData[PIVOT_KEY] = true;
  piece.root.children.slice().forEach(child => pivot.add(child));
  piece.root.add(pivot);
  return pivot;
}

// Recomputes `piece.bounds` (root space) after the model has been turned, so
// the floor, shadow and camera framing follow its new extent.
export function updatePieceBounds(piece: PortfolioPiece): void {
  piece.root.updateWorldMatrix(true, true);
  const toRoot = piece.root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  const bounds = new THREE.Box3();

  piece.root.traverse(object => {
    const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geometry?.attributes?.position) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.copy(geometry.boundingBox!).applyMatrix4(matrix.multiplyMatrices(toRoot, object.matrixWorld));
    bounds.union(box);
  });

  piece.bounds.copy(bounds);
}

export function resetModelRotation(piece: PortfolioPiece): void {
  modelPivot(piece).quaternion.identity();
  updatePieceBounds(piece);
}
