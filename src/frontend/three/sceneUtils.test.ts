import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  countVertices,
  createAddButton,
  disposeObject,
  fitCameraClipping,
  inspectionDistance,
  resetCameraClipping,
  DEFAULT_CAMERA_FAR,
  DEFAULT_CAMERA_NEAR,
} from './sceneUtils';
import { cubePiece } from './testPieces';

describe('inspectionDistance', () => {
  it('fits the model’s bounding sphere in the field of view', () => {
    const piece = cubePiece('a', 2);
    const camera = new THREE.PerspectiveCamera(60);
    const radius = Math.sqrt(12) / 2;
    expect(inspectionDistance(piece, camera)).toBeCloseTo(radius / Math.sin(Math.PI / 6));
  });

  it('stays positive for an empty model', () => {
    const piece = cubePiece('a', 0);
    expect(inspectionDistance(piece, new THREE.PerspectiveCamera(45))).toBeGreaterThan(0);
  });
});

describe('camera clipping', () => {
  it('scales the planes with the viewing distance, and resets them', () => {
    const camera = new THREE.PerspectiveCamera();
    fitCameraClipping(camera, 500);
    expect(camera.near).toBe(5);
    expect(camera.far).toBe(50_000);

    resetCameraClipping(camera);
    expect(camera.near).toBe(DEFAULT_CAMERA_NEAR);
    expect(camera.far).toBe(DEFAULT_CAMERA_FAR);
  });
});

describe('countVertices', () => {
  it('sums vertices across all meshes', () => {
    const piece = cubePiece('a');
    piece.root.add(new THREE.Mesh(new THREE.BoxGeometry()));
    expect(countVertices(piece)).toBe(48); // 24 per box (4 per face)
  });

  it('is 0 without a piece', () => {
    expect(countVertices(undefined)).toBe(0);
  });
});

describe('disposeObject', () => {
  it('disposes every geometry and material, including material arrays', () => {
    const geometry = new THREE.BoxGeometry();
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, materials));

    const spies = [geometry, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    disposeObject(root);
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});

describe('createAddButton', () => {
  it('builds a fresh, centered piece each time', () => {
    const a = createAddButton();
    const b = createAddButton();
    expect(a.root).not.toBe(b.root);
    expect(a.bounds.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0);
    expect(a.bounds.isEmpty()).toBe(false);
  });
});
