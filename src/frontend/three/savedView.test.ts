import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fromSavedCamera, toSavedCamera } from './savedView';

const rotationY = (degrees: number) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees));

describe('saved camera view', () => {
  it('round-trips a camera offset', () => {
    const offset = new THREE.Vector3(3, 4, 12); // length 13
    const rotation = rotationY(30);

    const saved = toSavedCamera(offset, rotation, 6.5);
    const { direction, distance } = fromSavedCamera(saved, rotation, 6.5);

    expect(saved.distanceFactor).toBe(2);
    expect(distance).toBeCloseTo(13);
    expect(direction.distanceTo(offset.clone().normalize())).toBeLessThan(1e-3);
  });

  it('follows the model when the carousel turns it', () => {
    // Saved while looking at the model's front, with the model unrotated...
    const saved = toSavedCamera(new THREE.Vector3(0, 0, 10), new THREE.Quaternion(), 5);

    // ...then shown after the carousel turned the model 90° around y.
    const { direction } = fromSavedCamera(saved, rotationY(90), 5);
    expect(direction.x).toBeCloseTo(1);
    expect(direction.z).toBeCloseTo(0);
  });

  it('stores a rounded, unit-length direction', () => {
    const saved = toSavedCamera(new THREE.Vector3(1, 1, 1), new THREE.Quaternion(), 1);
    for (const component of saved.direction) {
      expect(component).toBeCloseTo(1 / Math.sqrt(3), 4);
      expect(String(component).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
  });

  it('clamps the zoom factor to a sane range', () => {
    expect(toSavedCamera(new THREE.Vector3(0, 0, 1000), new THREE.Quaternion(), 1).distanceFactor).toBe(20);
    expect(toSavedCamera(new THREE.Vector3(0, 0, 0.001), new THREE.Quaternion(), 1).distanceFactor).toBe(0.05);
  });

  it('falls back to a front view for a degenerate saved direction', () => {
    const { direction } = fromSavedCamera({ direction: [0, 0, 0], distanceFactor: 1 }, new THREE.Quaternion(), 1);
    expect(direction.toArray()).toEqual([0, 0, 1]);
  });
});
