import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { modelPivot, updatePieceBounds, resetModelRotation } from './modelPivot';
import { cubePiece } from './testPieces';

function boxPiece() {
  const piece = cubePiece('a');
  // A 2 x 1 x 1 box, so turning it changes its bounds.
  const mesh = piece.root.children[0] as THREE.Mesh;
  mesh.geometry = new THREE.BoxGeometry(2, 1, 1);
  piece.bounds.setFromObject(piece.root);
  return piece;
}

describe('modelPivot', () => {
  it('moves the model under one pivot group, reused afterwards', () => {
    const piece = cubePiece('a');
    const model = piece.root.children[0];

    const pivot = modelPivot(piece);

    expect(piece.root.children).toEqual([pivot]);
    expect(model.parent).toBe(pivot);
    expect(modelPivot(piece)).toBe(pivot);
  });

  it('turns the model around its center, not its root', () => {
    const piece = boxPiece();
    piece.root.position.set(5, 0, 0);
    piece.root.lookAt(0, 0, 0);

    modelPivot(piece).rotation.y = Math.PI / 2;
    updatePieceBounds(piece);

    const center = piece.bounds.getCenter(new THREE.Vector3());
    const size = piece.bounds.getSize(new THREE.Vector3());
    expect(center.length()).toBeCloseTo(0);
    expect(size.x).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(2);
  });

  it('resets the rotation and the bounds', () => {
    const piece = boxPiece();
    modelPivot(piece).rotation.set(0.4, 1, 0.2);
    updatePieceBounds(piece);

    resetModelRotation(piece);

    expect(modelPivot(piece).quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(piece.bounds.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(5))).toEqual([2, 1, 1]);
  });
});
