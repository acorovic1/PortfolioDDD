import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cameraAnimationTo, easeInOutQuad, stepCameraAnimation } from './cameraAnimation';
import { cubePiece } from './testPieces';

describe('easeInOutQuad', () => {
  it('starts at 0, ends at 1 and is symmetric around the middle', () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5);
    expect(easeInOutQuad(0.25) + easeInOutQuad(0.75)).toBeCloseTo(1);
  });
});

describe('cameraAnimationTo', () => {
  it('keeps the current viewing angle at a size-based distance (at least 6)', () => {
    const piece = cubePiece('a', 1);
    piece.root.position.set(0, 0, 5);
    const camera = new THREE.Vector3(0, 0, 20);
    const orbit = new THREE.Vector3(0, 0, 0);

    const anim = cameraAnimationTo(piece, camera, orbit, {}, 0);

    expect(anim.toTarget.toArray()).toEqual([0, 0, 5]);
    expect(anim.toCameraPosition.x).toBeCloseTo(0);
    expect(anim.toCameraPosition.z).toBeCloseTo(11); // 5 + max(6, size * 1.8)
    expect(anim.fromCameraPosition).not.toBe(camera); // copies, not aliases
  });

  it('aims where a mid-rotation piece is heading', () => {
    const piece = cubePiece('a');
    piece.root.userData.targetPosition = new THREE.Vector3(3, 0, 0);
    const anim = cameraAnimationTo(piece, new THREE.Vector3(0, 0, 10), new THREE.Vector3(), {}, 0);
    expect(anim.toTarget.toArray()).toEqual([3, 0, 0]);
  });

  it('uses an explicit framing when given', () => {
    const piece = cubePiece('a');
    const anim = cameraAnimationTo(
      piece,
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(),
      { distance: 2, direction: new THREE.Vector3(5, 0, 0) },
      0
    );
    expect(anim.toCameraPosition.toArray()).toEqual([2, 0, 0]);
  });

  it('falls back to looking from +z when the camera sits on its target', () => {
    const piece = cubePiece('a');
    const anim = cameraAnimationTo(piece, new THREE.Vector3(), new THREE.Vector3(), { distance: 3 }, 0);
    expect(anim.toCameraPosition.toArray()).toEqual([0, 0, 3]);
  });
});

describe('stepCameraAnimation', () => {
  const anim = {
    startTime: 1000,
    duration: 1000,
    fromCameraPosition: new THREE.Vector3(0, 0, 10),
    toCameraPosition: new THREE.Vector3(0, 0, 20),
    fromTarget: new THREE.Vector3(0, 0, 0),
    toTarget: new THREE.Vector3(4, 0, 0),
  };

  it('interpolates the camera and orbit target together', () => {
    const camera = new THREE.Vector3();
    const orbit = new THREE.Vector3();

    expect(stepCameraAnimation(anim, camera, orbit, 1500)).toBe(false);
    expect(camera.z).toBeCloseTo(15);
    expect(orbit.x).toBeCloseTo(2);
  });

  it('finishes exactly at the destination, even if a frame comes late', () => {
    const camera = new THREE.Vector3();
    const orbit = new THREE.Vector3();

    expect(stepCameraAnimation(anim, camera, orbit, 5000)).toBe(true);
    expect(camera.toArray()).toEqual([0, 0, 20]);
    expect(orbit.toArray()).toEqual([4, 0, 0]);
  });
});
